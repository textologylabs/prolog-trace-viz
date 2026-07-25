# Prolog Execution Trace: t(1+0+1, C)

## Query

```
t(1+0+1, C)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 1 | `t(0+1, 1+0)` |
| 2 | `t(X+0+1, X+1+0)` |
| 3 | `t(X+1+1, Z) :- t(X+1, X1), t(X1+1, Z)` |

## Execution Timeline

┌─ Step 1: t(1+0+1, C)
│  Fact: t(X+0+1, X+1+0) [line 2]
│  Unifications:
│    X = 1
│  => C = 1+1+0
└─


## Call Tree

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%
graph TD

%% Nodes
A["?- t(1+0+1, C)"]
B["① t(1+0+1, C)<br/>C = 1+1+0 · fact 2"]
C["✓ C = 1+1+0"]

%% Flow
A --> B
B --> C

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px,color:#0b2440
style B fill:#c8e6c9,stroke:#388e3c,color:#14361a
style C fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px,color:#14361a
```

## Final Answer

```
C = 1+1+0
```

_Showing first solution only._