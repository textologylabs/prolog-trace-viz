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
graph TD

%% Nodes
A["① t(X+0+1, X+1+0)<br/>clause 2<br/>Result: X+1+0=1+1+0"]

%% Edges

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
```

## Final Answer

```
C = 1+1+0
```

_Showing first solution only._