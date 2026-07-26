# DD/LD Värde

Separat React/Vite-app för att jämföra ATG:s DD- och LD-odds med produkten av vinnaroddsen i de två loppen.

## Första versionen

- Hämtar DD och LD från ATG:s racinginfo-endpoint.
- Läser vinnarodds och `pools.dd.comboOdds` / `pools.ld.comboOdds`.
- Beräknar jämförelseodds, värdekvot och överodds.
- Uppdaterar var 60:e sekund.
- Behåller manuellt vald omgång.
- Räknar insatsfördelning för markerade kombinationer.
- Stresstestar insatsplanen mot ett valt procentuellt oddsfall.

## Starta

```bash
npm install
npm run dev
```

Appen lovar inte vinst. Beräknat plus gäller endast om en markerad kombination vinner och slutoddset inte faller mer än stresstestets antagande.

## Platsmodell Live Server (Cloudflare Worker)

Detta repo innehåller nu en separat serverdel som kör varje minut och fortsätter samla data även när sidan är stängd.

- Körschema: `* * * * *` (varje minut)
- Kod: `worker/src/index.ts`
- Worker config: `wrangler.toml`
- Supabase migration: `supabase/migrations/20260726_place_live_worker_v1.sql`

### Vad serverdelen gör

- Hämtar dagens svenska banor/lopp från ATG.
- Samlar odds från T-60 min fram till start och sparar minutpunkter i Supabase.
- Låser platsmodellen vid T-1 med samma regelmotor (`PLACE_V1.0`) som sidan använder.
- Sparar utvärdering + ev modellspel exakt en gång per lopp/rule version.
- Hämtar resultat efter lopp och rättar spel automatiskt (HIT/MISS/VOID + återbetalning/netto/ROI).

### Miljövariabler (Cloudflare Worker secrets/vars)

Krävs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Valfria:

- `ATG_API_BASE_URL` (default: `https://www.atg.se/services/racinginfo/v1/api`)
- `LOCK_GRACE_SECONDS` (default: `90`)
- `BET_SETTLEMENT_LOOKBACK_DAYS` (default: `3`)

### Lokala kommandon

```bash
npm run worker:dev
```

Trigga ett schemalagt jobb lokalt (ny terminal):

```bash
npm run worker:trigger
```

Alternativt via HTTP-endpoint:

```bash
curl http://127.0.0.1:8787/run-now
```

### Publicera serverdelen

1. Logga in i Cloudflare/Wrangler.
2. Sätt secrets:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

3. Deploy:

```bash
npm run worker:deploy
```

Efter deploy körs cron-jobbet automatiskt varje minut.
