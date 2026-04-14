# Déploiement — audit.alsek.fr

> Architecture : **Docker** + **Traefik** (reverse proxy + SSL auto) sur **VPS OVH Debian**
> Code source : GitHub → `git pull` sur le VPS

---

## 1. Prérequis sur le VPS

```bash
# Mise à jour
sudo apt update && sudo apt upgrade -y

# Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# ⚠️ Se déconnecter/reconnecter pour appliquer le groupe docker

# Installer Docker Compose (plugin)
sudo apt install -y docker-compose-plugin

# Vérifier
docker --version
docker compose version

# Installer Git
sudo apt install -y git
```

---

## 2. DNS — Pointer le sous-domaine

Chez ton registrar (OVH), ajouter :

```
Type: A
Nom:  audit
Valeur: [IP de ton VPS]
TTL: 3600
```

Attendre la propagation DNS (~5-30 min).

---

## 3. Cloner le repo GitHub

```bash
# Créer le dossier
sudo mkdir -p /opt/audit-alsek
sudo chown $USER:$USER /opt/audit-alsek

# Cloner
cd /opt/audit-alsek
git clone https://github.com/TON_USER/audit-alsek.git .
```

---

## 4. Configurer l'environnement

```bash
# Créer le .env à partir du template
cp .env.example .env
nano .env
```

Remplir les valeurs :
```env
PORT=3000

# Mot de passe admin (pour protéger le formulaire)
ADMIN_PASSWORD=ton_mot_de_passe_securise

# Google PageSpeed API Key
# → https://console.cloud.google.com/ → Activer "PageSpeed Insights API" → Créer une clé API
GOOGLE_PAGESPEED_API_KEY=AIzaSy...

# Apify Token (pour l'analyse Instagram)
# → https://console.apify.com/ → Settings → Integrations → API Token
APIFY_API_TOKEN=apify_api_...

# Infos agence
AGENCY_NAME=Alsek
AGENCY_WEBSITE=https://alsek.fr
AGENCY_EMAIL=contact@alsek.fr
AGENCY_PHONE=+33 X XX XX XX XX

# Email pour Let's Encrypt (utilisé par Traefik pour les certificats SSL)
ACME_EMAIL=contact@alsek.fr
```

---

## 5. Lancer l'application

```bash
cd /opt/audit-alsek

# Build + démarrage
docker compose up -d --build

# Voir les logs
docker compose logs -f

# Vérifier que tout tourne
docker compose ps
```

**C'est tout !** Traefik s'occupe automatiquement de :
- ✅ Obtenir le certificat SSL Let's Encrypt pour `audit.alsek.fr`
- ✅ Rediriger HTTP → HTTPS
- ✅ Router le trafic vers l'app Node.js

→ **L'app est accessible sur `https://audit.alsek.fr`**

---

## 6. Mise à jour (après un push sur GitHub)

```bash
cd /opt/audit-alsek

# Récupérer les dernières modifications
git pull

# Rebuild et redémarrer le container
docker compose up -d --build

# Vérifier
docker compose logs -f audit-alsek
```

---

## 7. Commandes utiles

```bash
# Voir les logs en temps réel
docker compose logs -f

# Redémarrer l'app
docker compose restart audit-alsek

# Arrêter tout
docker compose down

# Supprimer et recréer (reset complet)
docker compose down -v
docker compose up -d --build

# Accéder au shell du container
docker compose exec audit-alsek sh

# Voir la base de données
docker compose exec audit-alsek ls -la /app/data/
```

---

## 8. Obtenir les clés API

### Google PageSpeed Insights API (gratuit)
1. Aller sur [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un projet ou en sélectionner un existant
3. Menu → **API et services** → **Bibliothèque**
4. Chercher **"PageSpeed Insights API"** → **Activer**
5. Menu → **Identifiants** → **Créer des identifiants** → **Clé API**
6. Copier la clé → la coller dans `.env`

### Apify (scraping Instagram)
1. Aller sur [Apify Console](https://console.apify.com/)
2. Créer un compte (**gratuit : 5$/mois de crédits offerts**)
3. **Settings** → **Integrations** → Copier le **Personal API Token**
4. Le coller dans `.env`

> **Note :** Chaque analyse Instagram consomme ~0.01-0.05$ de crédits Apify.
> Avec les 5$ gratuits, tu peux analyser ~100-500 profils/mois.

---

## 9. Structure des URLs

| URL | Accès | Description |
|-----|-------|-------------|
| `https://audit.alsek.fr` | Admin | Formulaire de création d'audit |
| `https://audit.alsek.fr/admin` | Admin | Liste de tous les audits |
| `https://audit.alsek.fr/report/{id}` | Public | Rapport d'audit (partageable avec le client) |

---

## 10. Sauvegardes

La base de données SQLite est stockée dans un volume Docker (`app-data`).

```bash
# Sauvegarder la base
docker compose exec audit-alsek cp /app/data/audits.db /app/data/audits.db.bak

# Copier la base sur le serveur hôte
docker compose cp audit-alsek:/app/data/audits.db ./backup_audits.db
```
