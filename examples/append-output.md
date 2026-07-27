# Prolog Execution Trace: append([1,2], [3,4], X)

## Query

```
append([1,2], [3,4], X)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 4 | `append([], L, L)` |
| 5 | `append([H|T], L, [H|R]) :- append(T, L, R)` |

## Execution Timeline

<pre style="line-height: 1.15">
┌─ Step 1: append([1,2], [3,4], X)
│  Clause: append([H|T], L, [H|R]) [line 5]
│  Unifications:
│    H = 1
│    T = [2]
│    L = [3,4]
│  Subgoals:
│    [1.1] append(T, L, R) → append([2], [3,4], R)
│  
│  ┌─ Step 2 [Goal 1.1]: append(T, L, R) → append([2], [3,4], R)
│  │  Clause: append([H|T], L, [H|R]) [line 5]
│  │  Unifications:
│  │    H = 2
│  │    T = []
│  │    L = [3,4]
│  │  Subgoals:
│  │    [2.1] append(T, L, R) → append([], [3,4], R)
│  │  
│  │  ┌─ Step 3 [Goal 2.1]: append(T, L, R) → append([], [3,4], R)
│  │  │  Fact: append([], L, L) [line 4]
│  │  │  Unifications:
│  │  │    L = [3,4]
│  │  │  =&gt; R = [3,4]
│  │  └─
│  │  =&gt; R = [2,3,4]
│  └─
│  =&gt; X = [1,2,3,4]
└─

</pre>

## Call Tree

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%
graph TD

%% Nodes
A["?- append([1,2], [3,4], X)"]
B["① append([1,2], [3,4], X)<br/>X = [1,2,3,4] · clause 5"]
C["② append(T, L, R)<br/>R = [2,3,4] · clause 5"]
D["③ append(T, L, R)<br/>R = [3,4] · fact 4"]
E["✓ X = [1,2,3,4]"]

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
X = [1,2,3,4]
```

_Showing the first solution only — re-run with `-n <count>` or `--all` to see more._