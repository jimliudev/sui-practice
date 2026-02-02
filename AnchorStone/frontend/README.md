# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.



sui client call \
  --package 0xdf20cc3ba1e1ad5ad682053b62ffc48ac35aebcb0f00822581246c54e253fe7a \
  --module rwa_vault \
  --function mint_tokens_entry \
  --type-args 0x2::sui::SUI 0xc44e05666077f243179ca13129db761d7a07175c8abbe2967d046c896ba57715::property_token_0x2c71300f54bd5023d306808470b5b8f6ef1ef214f341b6c441e975f7cb4613a3_1769761410035::PROPERTY_TOKEN_0X2C71300F54BD5023D306808470B5B8F6EF1EF214F341B6C441E975F7CB4613A3_1769761410035 \
  --args 0x56cf6cd5118b713a5ae154cce9bad0449d3dea83437592d0313de5842bf9659d 1000000 \
  --gas-budget 100000000


 0xc44e05666077f243179ca13129db761d7a07175c8abbe2967d046c896ba57715::property_token_0x2c71300f54bd5023d306808470b5b8f6ef1ef214f341b6c441e975f7cb4613a3_1769761410035::PROPERTY_TOKEN_0X2C71300F54BD5023D306808470B5B8F6EF1EF214F341B6C441E975F7CB4613A3_1769761410035