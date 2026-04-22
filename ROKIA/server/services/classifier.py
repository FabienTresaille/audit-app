import logging
import asyncio
from typing import List, Dict, Any, Callable, Optional
from collections import Counter
from server.config import BATCH_SIZE, REFERENCE_PATH
from server.services.xlsx_parser import parse_reference, parse_tickets, group_tickets_by_number
from server.services.gemini import classify_batch
from server.database import get_db

logger = logging.getLogger(__name__)


def _chunk(lst: list, size: int) -> list:
    """Split a list into chunks of given size."""
    return [lst[i:i + size] for i in range(0, len(lst), size)]


async def process_tickets(
    analysis_id: int,
    tickets_path: str,
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """Main classification workflow.
    
    1. Load reference data (categories + contracts)
    2. Parse ticket file
    3. Group by ticket number
    4. Classify in batches via Gemini
    5. Compare old vs new categories
    6. Save results to DB
    7. Identify recurring issues
    """
    db = get_db()

    try:
        # Update status
        db.execute("UPDATE analyses SET status = 'processing' WHERE id = ?", (analysis_id,))
        db.commit()

        # 1. Load reference
        reference = parse_reference(REFERENCE_PATH)
        categories = reference['categories']
        contracts = reference['contracts']

        if not categories:
            raise ValueError("Aucune catégorie trouvée dans le fichier référentiel")

        # 2. Parse tickets
        raw_tickets = parse_tickets(tickets_path)
        if not raw_tickets:
            raise ValueError("Aucun ticket trouvé dans le fichier")

        # 3. Group by ticket number
        grouped = group_tickets_by_number(raw_tickets)
        ticket_list = list(grouped.values())
        total = len(ticket_list)

        logger.info(f"Processing {total} unique tickets for analysis {analysis_id}")

        # 4. Classify in batches
        batches = _chunk(ticket_list, BATCH_SIZE)
        all_classifications = {}
        processed = 0

        for batch_idx, batch in enumerate(batches):
            logger.info(f"Processing batch {batch_idx + 1}/{len(batches)}")

            try:
                results = await classify_batch(batch, categories, contracts)

                for r in results:
                    all_classifications[r.get('ticket_number', '')] = r

            except Exception as e:
                logger.error(f"Batch {batch_idx + 1} failed: {e}")
                for t in batch:
                    all_classifications[t['ticket_number']] = {
                        'ticket_number': t['ticket_number'],
                        'cause': t.get('old_category', 'ERREUR'),
                        'contract': t.get('old_contract', 'ERREUR'),
                        'delay': t.get('old_delay', ''),
                        'reasoning': f'Erreur de traitement: {str(e)[:100]}'
                    }

            processed += len(batch)
            if progress_callback:
                await progress_callback(processed, total)

            # Rate limiting between batches
            if batch_idx < len(batches) - 1:
                await asyncio.sleep(1)

        # 5. Build final results and compare
        final_results = []
        recategorized_count = 0

        for ticket in ticket_list:
            num = ticket['ticket_number']
            classification = all_classifications.get(num, {})

            new_category = classification.get('cause', ticket.get('old_category', ''))
            new_contract = classification.get('contract', ticket.get('old_contract', ''))
            new_delay = classification.get('delay', ticket.get('old_delay', ''))
            reasoning = classification.get('reasoning', '')

            old_cat = ticket.get('old_category', '').strip().lower()
            new_cat = new_category.strip().lower()
            was_recategorized = (old_cat != new_cat) and old_cat != ''

            if was_recategorized:
                recategorized_count += 1

            result = {
                'ticket_number': num,
                'dit_no_interne': num,
                'dit_etat': ticket.get('dit_etat', ''),
                'description': ticket.get('merged_description', '')[:500],
                'resolution': ticket.get('merged_resolution', '')[:500],
                'old_category': ticket.get('old_category', ''),
                'new_category': new_category,
                'old_contract': ticket.get('old_contract', ''),
                'new_contract': new_contract,
                'old_delay': ticket.get('old_delay', ''),
                'new_delay': new_delay,
                'was_recategorized': was_recategorized,
                'ai_reasoning': reasoning,
            }
            final_results.append(result)

        # 6. Save to DB
        for r in final_results:
            db.execute("""
                INSERT INTO ticket_results 
                (analysis_id, ticket_number, dit_no_interne, dit_etat,
                 description, resolution, old_category, new_category,
                 old_contract, new_contract, old_delay, new_delay,
                 was_recategorized, ai_reasoning)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                analysis_id, r['ticket_number'], r['dit_no_interne'], r['dit_etat'],
                r['description'], r['resolution'], r['old_category'], r['new_category'],
                r['old_contract'], r['new_contract'], r['old_delay'], r['new_delay'],
                1 if r['was_recategorized'] else 0, r['ai_reasoning']
            ))

        db.execute("""
            UPDATE analyses 
            SET status = 'completed', total_tickets = ?, recategorized_count = ?
            WHERE id = ?
        """, (total, recategorized_count, analysis_id))
        db.commit()

        # 7. Identify recurring issues
        recurring = _identify_recurring_issues(final_results)

        logger.info(
            f"Analysis {analysis_id} completed: {total} tickets, "
            f"{recategorized_count} recategorized"
        )

        return {
            'results': final_results,
            'recurring_issues': recurring,
            'total': total,
            'recategorized': recategorized_count,
        }

    except Exception as e:
        logger.error(f"Analysis {analysis_id} failed: {e}")
        db.execute(
            "UPDATE analyses SET status = 'error', error_message = ? WHERE id = ?",
            (str(e)[:500], analysis_id)
        )
        db.commit()
        raise
    finally:
        db.close()


def _identify_recurring_issues(results: List[Dict]) -> List[Dict]:
    """Identify recurring issues based on new categories."""
    category_counter = Counter()
    category_tickets = {}

    for r in results:
        cat = r.get('new_category', '')
        if not cat:
            continue
        category_counter[cat] += 1
        if cat not in category_tickets:
            category_tickets[cat] = []
        category_tickets[cat].append(r['ticket_number'])

    recurring = []
    for cat, count in category_counter.most_common():
        if count >= 2:  # At least 2 occurrences to be "recurring"
            recurring.append({
                'category': cat,
                'count': count,
                'tickets': ', '.join(category_tickets[cat][:20]),
                'detail': f"Cette problématique apparaît dans {count} tickets distincts.",
            })

    return recurring
