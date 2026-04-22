# ROKIA — Guide de Déploiement

## Prérequis sur le VPS
- Docker et Docker Compose installés
- Traefik configuré avec le réseau `traefik_network`
- DNS : `rokia.alsek.fr` pointant vers le VPS

## Déploiement

### 1. Transférer les fichiers
```bash
# Depuis votre machine locale
scp -r ROKIA/ user@your-vps:/opt/rokia/
```

### 2. Configurer l'environnement
```bash
cd /opt/rokia
cp .env.example .env
nano .env
# Renseigner : GEMINI_API_KEY, ADMIN_PASSWORD, JWT_SECRET
```

### 3. Lancer l'application
```bash
docker compose up -d --build
```

### 4. Vérifier
```bash
docker compose logs -f rokia
```

L'application est accessible sur https://rokia.alsek.fr

## Mise à jour
```bash
cd /opt/rokia
git pull  # ou scp des nouveaux fichiers
docker compose up -d --build
```

## Identifiants par défaut
- **Login** : admin
- **Mot de passe** : Rokia2026! (à changer dans .env)
