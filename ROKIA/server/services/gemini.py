import json
import logging
import asyncio
import google.generativeai as genai
from typing import List, Dict, Any
from server.config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)
genai.configure(api_key=GEMINI_API_KEY)


def _build_system_prompt(categories: List[str], contracts: List[Dict]) -> str:
    cats = "\n".join(f"  - {c}" for c in categories)
    conts = ""
    for c in contracts:
        conts += f"  - {c['name']} | Options: {c.get('options','N/A')} | Délai: {c.get('delay','N/A')} | Couvre: {c.get('covered_elements','N/A')}\n"
    return (
        "Tu es un expert en support informatique. Catégorise les tickets selon les référentiels.\n"
        "RÈGLES: 1) Cause = exactement une de la liste. 2) Contrat = un de la liste ou 'HORS CONTRAT'. "
        "3) Délai = celui du contrat choisi.\n\n"
        f"CAUSES POSSIBLES:\n{cats}\n\nCONTRATS:\n{conts}"
    )


def _build_user_prompt(batch: List[Dict]) -> str:
    items = [{"ticket_number": t['ticket_number'],
              "description": t.get('merged_description','')[:2000],
              "resolution": t.get('merged_resolution','')[:2000],
              "current_cause": t.get('old_category',''),
              "current_contract": t.get('old_contract','')} for t in batch]
    return (
        f"Tickets:\n{json.dumps(items, ensure_ascii=False, indent=1)}\n\n"
        "Réponds UNIQUEMENT en JSON valide:\n"
        '[{"ticket_number":"...","cause":"...","contract":"...","delay":"...","reasoning":"..."}]'
    )


async def classify_batch(batch: List[Dict], categories: List[str], contracts: List[Dict], max_retries=3) -> List[Dict]:
    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        system_instruction=_build_system_prompt(categories, contracts),
        generation_config=genai.GenerationConfig(temperature=0.1, top_p=0.95))
    prompt = _build_user_prompt(batch)

    for attempt in range(max_retries):
        try:
            resp = await asyncio.to_thread(model.generate_content, prompt)
            text = resp.text.strip()
            if text.startswith("```"):
                text = "\n".join(text.split("\n")[1:-1])
            results = json.loads(text)
            if not isinstance(results, list):
                raise ValueError("Not a list")
            logger.info(f"Batch OK: {len(results)} tickets")
            return results
        except json.JSONDecodeError as e:
            logger.warning(f"JSON error attempt {attempt+1}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                return [{"ticket_number": t['ticket_number'], "cause": t.get('old_category','ERREUR'),
                         "contract": t.get('old_contract','ERREUR'), "delay": "", "reasoning": "Erreur IA"} for t in batch]
        except Exception as e:
            logger.error(f"Gemini error attempt {attempt+1}: {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(2 ** attempt)
            else:
                raise
