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
│  │  │  => R = [3,4]
│  │  └─
│  │  => R = [2,3,4]
│  └─
│  => X = [1,2,3,4]
└─


## Call Tree

```mermaid
graph TD

%% Nodes
A["?- append([1,2], [3,4], X)"]
B["① append([1,2], [3,4], X)<br/>clause 5<br/>X = [1,2,3,4]"]
C["② append(T, L, R)<br/>clause 5<br/>R = [2,3,4]"]
D["③ append(T, L, R)<br/>fact 4<br/>R = [3,4]"]

%% Edges
A --> B
B -->|"[1.1]"| C
C -->|"[2.1]"| D

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px
style B fill:#c8e6c9,stroke:#388e3c
style C fill:#c8e6c9,stroke:#388e3c
style D fill:#c8e6c9,stroke:#388e3c
```

## Final Answer

```
X = [1,2,3,4]
```

_Showing first solution only._