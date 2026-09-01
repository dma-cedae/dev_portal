# 🚀 Portal-DMA — Ambiente de Produção

Este repositório contém o código-fonte da versão final e estável do **Portal-DMA** em ambiente de produção. O código hospedado aqui é o que está sendo distribuído diretamente para os usuários finais.

⚠️ **IMPORTANTE:** Nunca faça alterações, commits ou pushes diretamente na branch principal deste repositório sem antes testá-los exaustivamente no ambiente de desenvolvimento.

---

## 🛠️ Fluxo de Trabalho (Workflow)

Para garantir a estabilidade do sistema, adotamos um fluxo de desenvolvimento isolado:

1. **Desenvolvimento e Testes:** Todas as novas funcionalidades, correções de bugs ou alterações de layout devem ser feitas obrigatoriamente no repositório de desenvolvimento:
   👉 [dev_portal](https://github.com)
2. **Homologação:** As alterações devem ser validadas e testadas localmente ou no servidor de dev.
3. **Deploy em Produção:** Após a aprovação dos testes, o código estável é sincronizado com este repositório (`Portal-DMA`).

---

## 💻 Como rodar o projeto localmente

Caso precise clonar este ambiente para verificar o estado atual da produção:

```bash
# Clone o repositório de produção
git clone https://github.com

# Instale as dependências necessárias
npm install

# Inicie o servidor de produção
npm start
```

---

## 🗂️ Estrutura Principal do Projeto

* `/server.js` - Arquivo de inicialização do servidor principal.
* `/assets`, `/css`, `/js` - Arquivos estáticos da interface.
* `/data` - Arquivos de dados e bases técnicas.

---
🏢 **DMA - CEDAE** | © 2026
