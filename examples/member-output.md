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
A["?- member(X, [a,b,c])"]
B["① member(X, [a,b,c])<br/>fact 4<br/>X = a"]

%% Edges
A --> B

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
style B fill:#c8e6c9,stroke:#388e3c
```

## Final Answer

```
X = a
```

_Showing first solution only._