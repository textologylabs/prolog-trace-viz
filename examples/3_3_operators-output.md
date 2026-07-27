# Prolog Execution Trace: t(0+1+1, B)

## Query

```
t(0+1+1, B)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 5 | `test1 :- Term = (jimmy plays football and squash), write('Pretty: '), write(Term), nl, write('Canonical: '), write_canonical(Term), nl` |
| 10 | `test2 :- Term = (susan plays tennis and basketball and volleyball), write('Pretty: '), write(Term), nl, write('Canonical: '), write_canonical(Term), nl` |
| 19 | `diana was the secretary of the department` |
| 20 | `test3 :- Term = (diana was the secretary of the department), write('Pretty: '), write(Term), nl, write('Canonical: '), write_canonical(Term), nl` |
| 26 | `t(0+1, 1+0)` |
| 27 | `t(X+0+1, X+1+0)` |
| 28 | `t(X+1+1, Z) :- t(X+1, X1), t(X1+1, Z)` |

## Execution Timeline

<pre style="line-height: 1.15">
┌─ Step 1: t(0+1+1, B)
│  Clause: t(X@1+1+1, Z) [line 28]
│  Unifications:
│    X@1 = 0
│  Subgoals:
│    [1.1] t(X@1+1, X1) → t(0+1, X1)
│    [1.2] t(X1+1, Z)
│  
│  ┌─ Step 2 [Goal 1.1]: t(X@1+1, X1) → t(0+1, X1)
│  │  Fact: t(0+1, 1+0) [line 26]
│  │  =&gt; X1 = 1+0
│  └─
│  ┌─ Step 3 [Goal 1.2]: t(X1+1, Z) → t(1+0+1, Z)
│  │  where X1 = 1+0 (from Step 2)
│  │  Fact: t(X@3+0+1, X@3+1+0) [line 27]
│  │  Unifications:
│  │    X@3 = 1
│  │  =&gt; Z = 1+1+0
│  └─
│  =&gt; B = 1+1+0
└─

</pre>

## Call Tree

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%
graph TD

%% Nodes
A["?- t(0+1+1, B)"]
B["① t(0+1+1, B)<br/>B = 1+1+0 · clause 28"]
C["② t(X@1+1, X1)<br/>X1 = 1+0 · fact 26"]
D["③ t(1+0+1, Z)<br/>Z = 1+1+0 · fact 27"]
E["✓ B = 1+1+0"]

%% Flow
A --> B
B --> C
C --> D
B --> E

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px,color:#0b2440
style B fill:#c8e6c9,stroke:#388e3c,color:#14361a
style C fill:#c8e6c9,stroke:#388e3c,color:#14361a
style D fill:#c8e6c9,stroke:#388e3c,color:#14361a
style E fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px,color:#14361a
```

## Final Answer

```
B = 1+1+0
```

_Showing the first solution only — re-run with `-n <count>` or `--all` to see more._