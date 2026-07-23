# Prolog Execution Trace: member(X, [a,b,c])

## Query

```
member(X, [a,b,c])
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 4 | `member(X, [X|_])` |
| 5 | `member(X, [_|T]) :- member(X, T)` |

## Execution Timeline

┌─ Step 1: member(X, [a,b,c])
│  Fact: member(X, [X|_]) [line 4]
│  Unifications:
│    X = a
│    _ = [b,c]
│  => X = a
└─


## Call Tree

```mermaid
graph TD

%% Nodes
A["① member(X, [X|_])<br/>clause 4<br/>Result: [X|_]=a"]

%% Edges

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
```

## Final Answer

```
X = a
```

_Showing first solution only._