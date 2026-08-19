# Documentação

## Documento mestre

**[`especificacao-operacional.docx`](especificacao-operacional.docx)** — fonte única de
verdade sobre o comportamento do sistema (23 páginas, 16 secções). Também disponível
em [PDF](especificacao-operacional.pdf).

Cobre: requisitos funcionais e não-funcionais, catálogo de regras de segurança clínica,
regras de negócio, máquinas de estado, arquitetura, modelo de dados, contratos de API,
casos de erro, observabilidade, cenários de teste, configuração e manual operacional.

> Regra de alteração: qualquer mudança de comportamento começa por uma alteração neste
> documento, e só depois no código.

## Consulta rápida

| Documento | Para quê |
|---|---|
| [`referencia-rapida.md`](referencia-rapida.md) | Regras, estados e IDs — consulta durante desenvolvimento e revisão de código |
| [`decisoes-arquiteturais.md`](decisoes-arquiteturais.md) | ADR-001..006 — o que foi decidido e o que se sacrificou |

## Identificadores

| Prefixo | Significa |
|---|---|
| `RF-xxx` | Requisito funcional |
| `RN-xxx` | Regra de negócio |
| `RS-xxx` | Regra de segurança clínica |
| `RNF-xxx` | Requisito não-funcional |
| `ERR-xxx` | Caso de erro tratado |
| `CT-xxx` | Cenário de teste |

Use-os em issues, commits e testes — é assim que se mantém rastreabilidade entre o
especificado e o construído.

## Diagramas

| Ficheiro | Mostra |
|---|---|
| `diagramas/arquitetura.png` | Vista de contentores |
| `diagramas/fluxo-escalonamento.png` | O gate a decidir antes da IA |
| `diagramas/estado-escalonamento.png` | Ciclo de vida do escalonamento |
| `diagramas/estado-reserva.png` | Ciclo de vida da reserva e impacto no stock |
| `diagramas/modelo-dados.png` | Modelo entidade-relação multi-tenant |
| `diagramas/mockup-*.png` | Propostas de interface |

## Protótipos

Em [`../prototipos/`](../prototipos):

- **`canal-cliente.jsx`** — canal do cliente com o motor de segurança, landing
  comercial e captação de leads
- **`consola-interna.jsx`** — consola da farmácia: fila com SLA, ciclo de vida das
  reservas, inventário e auditoria

Validam comportamento e fluxo. Não são a implementação de produção.
