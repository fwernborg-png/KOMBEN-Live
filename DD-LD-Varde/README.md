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
