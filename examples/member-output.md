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

<pre style="line-height: 1.15">
┌─ Step 1: member(X, [a,b,c])
│  Fact: member(X, [X|_]) [line 4]
│  Unifications:
│    X = a
│    _ = [b,c]
│  =&gt; X = a
└─

</pre>

## Call Tree

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%
graph TD

%% Nodes
A["?- member(X, [a,b,c])"]
B["① member(X, [a,b,c])<br/>X = a · fact 4"]
C["✓ X = a"]

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
X = a
```

_Showing first solution only._