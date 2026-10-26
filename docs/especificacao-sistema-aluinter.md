# Especificação do sistema — CRM Aluinter

**Produto:** CRM comercial com atendimento via WhatsApp Business  
**Idioma da interface:** Português (Brasil)  
**Documento para:** apresentação ao cliente  
**Versão do software:** 0.8  

---

## 1. O que é o CRM

O CRM Aluinter é um sistema web de gestão comercial e atendimento. Ele concentra, em um só lugar:

- a conversa com o cliente no **WhatsApp** (número oficial da empresa);
- a **carteira de contatos**;
- o **funil de vendas** (orçamentos e negócios);
- **disparos** e **automações**;
- o **painel de indicadores** da operação (Gestão, Operação e Marketing).

O consultor atende, registra o negócio e acompanha meta no mesmo sistema. Não é necessário abrir planilha à parte para o dia a dia do comercial.

O acesso é feito pelo navegador, com login (e-mail e senha). Cada empresa tem a sua conta; vários usuários da mesma equipe compartilham a caixa de entrada, os contatos e o funil.

---

## 2. Linguagem do produto

| Item | Definição |
| --- | --- |
| Idioma da tela | **Português do Brasil** (textos, menus, datas e moeda) |
| Moeda padrão da carteira | **Real (BRL)** |
| Outros idiomas no código | Catálogos em inglês e coreano existem para manutenção técnica; o sistema em uso está fixo em português |

---

## 3. Linguagens e plataforma (tecnologia)

O sistema é uma aplicação web moderna. Front e back são o mesmo projeto, em TypeScript.

| Camada | Tecnologia |
| --- | --- |
| Linguagem | **TypeScript** (e JavaScript no runtime) |
| Interface (front) | **React 19** + **Next.js 16** |
| Backend (servidor e APIs) | **Node.js** (rotas e funções do Next.js) |
| Banco de dados | **PostgreSQL** (Supabase) |
| Autenticação | **Supabase Auth** (login, sessão, convites de equipe) |
| Tempo real | Atualização ao vivo da caixa de entrada e notificações |
| Estilo da interface | **Tailwind CSS** |
| Integração de mensagens | **WhatsApp Business API** (Meta) |
| Assistente de IA (opcional) | Chave própria da empresa (OpenAI ou Anthropic), armazenada criptografada |

**Resumo para o cliente:** o “front” e o “back” são escritos em **TypeScript/Node.js**. Os dados ficam em **PostgreSQL**. O WhatsApp entra pela API oficial da Meta.

---

## 4. Funcionalidades

### 4.1 Painel (dashboard)

Três visões, com filtro de período (hoje, semana, mês ou intervalo de datas):

- **Gestão** — oito indicadores da carteira (semáforo verde / amarelo / vermelho): conversas reais, orçamentos, cobertura de Curva A, follow-up, faturamento contra meta, novos e reativados, desconto (quando houver integração com o Easy) e retração de base.
- **Operação** — volume do dia a dia: conversas ativas, novos contatos, valor em aberto no funil, mensagens enviadas, gráfico de volume, tempo de resposta e atividade recente.
- **Marketing** — estrutura pronta para mídia (investimento, leads, CPL, funil campanha → CRM). Os números de anúncio entram quando a Business Manager da Meta for conectada.

### 4.2 Caixa de entrada (WhatsApp)

- Inbox compartilhada no número oficial da empresa.
- Conversa em tempo real: texto, mídia, templates aprovados pela Meta.
- Atribuição de conversa a um consultor, status (aberta / pendente / encerrada) e notas.
- Respostas rápidas e rascunho com IA (opcional).
- Painel do contato ao lado da conversa (dados, tags, negócios).

### 4.3 Contatos

- Cadastro com telefone, nome, e-mail, empresa.
- Tags (incluindo classificação **Curva A / B / C**).
- Campos personalizados e notas.
- Importação por CSV e prevenção de telefone duplicado na mesma conta.

### 4.4 Funis de vendas

- Kanban com etapas configuráveis (ex.: Novo lead, Qualificado, Orçamento, Negociação, Ganho).
- Negócio ligado ao contato e à conversa, com valor em R$, responsável e status (aberto, ganho, perdido).
- Indicadores do funil: quantidade, valor total e ticket médio.

### 4.5 Disparos (broadcast)

- Envio em massa com **templates aprovados** pela Meta.
- Filtro de audiência, variáveis por destinatário.
- Acompanhamento de envio, entrega, leitura e resposta.

### 4.6 Automações

- Construtor visual, sem código.
- Gatilhos: nova mensagem, novo contato, palavra-chave, tag, horário.
- Ações: enviar mensagem, atribuir consultor, aplicar tag, esperar, ramificar, chamar webhook.

### 4.7 Fluxos (beta)

- Fluxos conversacionais visuais para menus e roteiros no WhatsApp.

### 4.8 Agentes de IA

- Assistente com chave da própria empresa (não há cobrança por assento de IA do produto).
- Rascunho de resposta na caixa de entrada.
- Autoatendimento opcional, com limite por conversa e passagem para humano.
- Base de conhecimento (FAQ, políticas, produtos) para responder com o conteúdo da Aluinter.

### 4.9 Equipe e permissões

Papéis na mesma conta:

| Papel | Uso típico |
| --- | --- |
| Proprietário | Dono da conta; pode transferir a titularidade |
| Administrador | Configurações, WhatsApp, membros, chaves de API |
| Agente | Atende, cria contatos e negócios |
| Visualizador | Somente leitura |

Convite por link, com validade. Um número de WhatsApp por conta.

### 4.10 Configurações

- Perfil, senha e aparência.
- Conexão WhatsApp Business (credenciais Meta e webhook).
- Templates, respostas rápidas, tags e campos.
- Moeda padrão dos negócios (BRL).
- Chaves de API para integrações externas.

### 4.11 API e integrações

- API REST pública (`/api/v1`) com chaves revogáveis: contatos, conversas, mensagens e disparos.
- Webhooks de saída para sistemas da empresa.
- Integração futura prevista: **Easy** (orçamento formal, faturamento, desconto e compra) e **Meta Business Manager** (mídia).

---

## 5. Segurança

- Cada usuário só vê os dados da própria conta (isolamento no banco).
- Tokens do WhatsApp e chaves de IA gravados **criptografados**.
- Webhooks da Meta validados por assinatura.
- Sessão autenticada; encerramento global de sessões disponível.

---

## 6. O que já está no CRM e o que depende de outro sistema

| Capacidade | Situação |
| --- | --- |
| Atendimento WhatsApp, contatos, funil, disparos, automações, painel | **No CRM** |
| Conversas reais, Curva A, cadência de follow-up | **Medidos no CRM** |
| Orçamento formal, NF, desconto de tabela, compra | **Easy** (integração a construir) |
| Investimento, CPL e campanhas de anúncio | **Business Manager** (integração a construir) |

Enquanto Easy e BM não estiverem ligados, o painel de Gestão usa números do funil como **proxy** (negócios criados e ganhos) e deixa explícito o que ainda não tem dado.

---

## 7. Requisitos de uso

- Navegador atualizado (Chrome, Edge, Safari ou Firefox).
- Conta **WhatsApp Business API** (Meta) para o número da empresa.
- Acesso à internet. O sistema é web; não exige instalação no computador do consultor.

---

## 8. Resumo executivo

| Pergunta | Resposta |
| --- | --- |
| O que é? | CRM web da Aluinter, focado em WhatsApp + funil comercial |
| Em que língua o usuário vê? | Português (Brasil) |
| Em que língua o sistema é feito? | TypeScript, na plataforma Node.js / Next.js |
| Onde ficam os dados? | PostgreSQL (Supabase), com login e permissão por conta |
| Canal principal? | WhatsApp Business API (oficial) |
| Serve para o comercial? | Sim: inbox, contato, orçamento no funil, indicadores RAG e equipe |

---

*Documento técnico-comercial. Pode ser anexado a proposta, kickoff ou alinhamento com a diretoria.*
