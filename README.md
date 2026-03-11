# ncms_botv2

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.8. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Positions

Set `POSITION_ROLE_IDS` in `.env` to map position codes to Discord role IDs:

```env
POSITION_ROLE_IDS=br:123,so:456,lo:789
```

Then deploy commands and use `/pozycje`.
