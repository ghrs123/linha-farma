# Referência rápida

Extrato consultável da [especificação operacional](especificacao-operacional.docx).
O documento `.docx` é a fonte de verdade; este ficheiro existe para consulta rápida
e para permitir *diff* em revisões de código.

---

## Fronteiras absolutas

O sistema **nunca**, sob nenhuma configuração:

- fornece diagnóstico médico
- recomenda, sugere ou prescreve medicação
- indica dose, posologia ou interações
- substitui o julgamento do farmacêutico

Não existe definição, permissão ou papel que desative estas fronteiras.

---

## Regras de segurança clínica (RS)

Executam **antes** de qualquer chamada ao modelo de IA.

| ID | Categoria | Termos (excerto) |
|---|---|---|
| RS-001 | Gravidez / amamentação | grávida, gravida, amament |
| RS-002 | Criança / bebé | bebé, bebe, criança, crianca, filho |
| RS-003 | Receita / antibiótico | antibiót, antibiot, receita, MSRM |
| RS-004 | Sintoma grave | falta de ar, peito, sangue, febre alta, alerg |
| RS-005 | Dose / interação | dose, dosagem, misturar, interaç |
| RS-006 | Queixa clínica | dor, cabeç/cabec/cabex, febre, tosse, náusea |
| RS-007 | Pedido de recomendação | remédio, o que tomo, posso tomar, recomenda |

**Assimetria deliberada:** as regras escalam a mais. Falso positivo custa um olhar a
um ticket; falso negativo custa a saúde de um cliente.

---

## Regras de negócio (RN)

| ID | Regra |
|---|---|
| RN-001 | O motor de segurança executa antes de qualquer chamada à IA |
| RN-002 | Nenhuma resposta contém stock ou preço não lido da base de dados |
| RN-003 | Stock é deduzido quando a reserva entra em `PENDENTE` |
| RN-004 | `CANCELADA` e `EXPIRADA` devolvem ao inventário a quantidade deduzida |
| RN-005 | `LEVANTADA` não devolve stock — a unidade foi consumida |
| RN-006 | Nunca criar reserva para produto com `qty <= 0` |
| RN-007 | Produto sujeito a receita exige validação humana |
| RN-008 | Todo o movimento de stock gera histórico com motivo e origem |
| RN-009 | Toda a query é filtrada por `tenant_id` |
| RN-010 | Escalonamento `RESOLVIDO` não reabre — abre-se novo ticket ligado |
| RN-011 | Toda a transição gera auditoria com o ator responsável |
| RN-012 | Falha da IA nunca desativa o motor de segurança |

> **RN-004** é a regra mais esquecida em implementações deste tipo. Sem ela, cada
> cancelamento consome permanentemente uma unidade e a divergência só aparece no
> inventário físico, meses depois.

---

## Máquinas de estado

### Escalonamento

```
NOVO → ATRIBUIDO → EM_ATENDIMENTO → RESOLVIDO
  └─ flag ATRASADO quando tempo em NOVO > ESCALATION_SLA_MINUTES
```

`ATRASADO` é um indicador, não um estado.

### Reserva

```
PENDENTE → CONFIRMADA → PRONTA → LEVANTADA
   │            │          │
   └────────────┴──────────┴──→ CANCELADA | EXPIRADA   (devolvem stock)
```

| Transição | Efeito no stock |
|---|---|
| → `PENDENTE` | −1 |
| → `CONFIRMADA` / `PRONTA` | sem alteração |
| → `LEVANTADA` | sem alteração (consumido) |
| → `CANCELADA` / `EXPIRADA` | **+1 devolvido** |

Transições não listadas são inválidas → `409 INVALID_TRANSITION`.

### Stock (derivado)

| Estado | Condição | Reservas |
|---|---|---|
| `OK` | `qty > min` | permitidas |
| `BAIXO` | `0 < qty <= min` | permitidas + alerta |
| `RUTURA` | `qty = 0` | recusadas |

---

## Pipeline de mensagem

A ordem é obrigatória. Inverter 2 e 3 anula a garantia de segurança.

1. Autenticar e resolver tenant
2. **Executar motor de segurança** ← bloqueia aqui se sensível
3. Invocar IA (só se seguro)
4. Validar saída da IA contra a base de dados
5. Aplicar regras de negócio e persistir
6. Registar auditoria
7. Devolver resposta

---

## Casos de erro (ERR)

| ID | Situação | Comportamento |
|---|---|---|
| ERR-001 | Produto não reconhecido | Responder capacidades; não adivinhar |
| ERR-002 | Confiança abaixo do limiar | Pedir confirmação antes de agir |
| ERR-003 | IA indisponível | Gate ativo; fallback determinístico; alertar |
| ERR-004 | BD indisponível | Não usar cache de stock; informar |
| ERR-005 | Reserva concorrente sem stock | Transação falha; sem stock negativo |
| ERR-006 | Transição inválida | `409` com estado atual |
| ERR-007 | Job de expiração falhou | Alerta de operação |
| ERR-008 | Token inválido | `401` sem revelar recursos |
| ERR-009 | Acesso cross-tenant | `404` + registo de segurança |

---

## Testes bloqueantes

Nenhuma versão vai a produção com qualquer um a falhar.

| ID | Cenário | Esperado |
|---|---|---|
| CT-001 | "estou grávida e tenho dor" | RS-001; `aiInvoked = false` |
| CT-002 | "o meu filho de 3 anos tem febre" | RS-002 |
| CT-003 | "tenho tido dores de cabexa" | RS-006 (tolerância a erro) |
| CT-004 | "preço para remédio de dor de cabeca" | RS-007 |
| CT-005 | Reservar produto com receita | Recusado (RN-007) |
| CT-006 | IA em baixo + mensagem sensível | Continua bloqueado (RN-012) |
| CT-007 | Reserva → cancelar | Stock restaurado (RN-004) |
| CT-011 | Duas reservas concorrentes, 1 unidade | Uma falha; `qty = 0` |
| CT-013 | Acesso cross-tenant | `404` |

---

## Configuração

| Variável | Efeito | Omissão |
|---|---|---|
| `ESCALATION_SLA_MINUTES` | Minutos até `ATRASADO` | 5 |
| `RESERVATION_EXPIRY_HOURS` | Horas até expirar reserva | 48 |
| `OLLAMA_MODEL` | Modelo local | `qwen3:4b` |
| `OLLAMA_TIMEOUT_SECONDS` | Timeout → ERR-003 | 20 |
| `JWT_EXPIRATION_MINUTES` | Validade do token | 60 |

Nenhuma configuração pode desativar as fronteiras absolutas.
