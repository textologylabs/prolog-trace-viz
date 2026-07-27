# Prolog Execution Trace: factorial(3, X)

## Query

```
factorial(3, X)
```

## Clause Definitions

| Line # | Clause |
|--------|--------|
| 4 | `factorial(0, 1)` |
| 5 | `factorial(N, R) :- N > 0, N1 is N - 1, factorial(N1, R1), R is N * R1` |

## Execution Timeline

<pre style="line-height: 1.15">
┌─ Step 1: factorial(3, X)
│  Clause: factorial(N, R) [line 5]
│  Unifications:
│    N = 3
│  Subgoals:
│    [1.1] N &gt; 0 → 3 &gt; 0
│    [1.2] N1 is N - 1 → N1 is 3 - 1
│    [1.3] factorial(N1, R1)
│    [1.4] R is N * R1 → R is 3 * R1
│  
│  ┌─ Step 2 [Goal 1.1]: N &gt; 0 → 3 &gt; 0
│  └─
│  ┌─ Step 3 [Goal 1.2]: N1 is N - 1 → N1 is 3 - 1
│  │  =&gt; N1 = 2
│  └─
│  ┌─ Step 4 [Goal 1.3]: factorial(2, R1)
│  │  Clause: factorial(N, R) [line 5]
│  │  Unifications:
│  │    N = 2
│  │  Subgoals:
│  │    [4.1] N &gt; 0 → 2 &gt; 0
│  │    [4.2] N1 is N - 1 → N1 is 2 - 1
│  │    [4.3] factorial(N1, R1)
│  │    [4.4] R is N * R1 → R is 2 * R1
│  │  
│  │  ┌─ Step 5 [Goal 4.1]: N &gt; 0 → 2 &gt; 0
│  │  └─
│  │  ┌─ Step 6 [Goal 4.2]: N1 is N - 1 → N1 is 2 - 1
│  │  │  =&gt; N1 = 1
│  │  └─
│  │  ┌─ Step 7 [Goal 4.3]: factorial(1, R1)
│  │  │  Clause: factorial(N, R) [line 5]
│  │  │  Unifications:
│  │  │    N = 1
│  │  │  Subgoals:
│  │  │    [7.1] N &gt; 0 → 1 &gt; 0
│  │  │    [7.2] N1 is N - 1 → N1 is 1 - 1
│  │  │    [7.3] factorial(N1, R1)
│  │  │    [7.4] R is N * R1 → R is 1 * R1
│  │  │  
│  │  │  ┌─ Step 8 [Goal 7.1]: N &gt; 0 → 1 &gt; 0
│  │  │  └─
│  │  │  ┌─ Step 9 [Goal 7.2]: N1 is N - 1 → N1 is 1 - 1
│  │  │  │  =&gt; N1 = 0
│  │  │  └─
│  │  │  ┌─ Step 10 [Goal 7.3]: factorial(0, R1)
│  │  │  │  Fact: factorial(0, 1) [line 4]
│  │  │  │  =&gt; R1 = 1
│  │  │  └─
│  │  │  ┌─ Step 11 [Goal 7.4]: R is N * R1 → R is 1 * 1
│  │  │  │  where R1 = 1 (from Step 10)
│  │  │  │  =&gt; R = 1
│  │  │  └─
│  │  │  =&gt; R1 = 1
│  │  └─
│  │  ┌─ Step 12 [Goal 4.4]: R is N * R1 → R is 2 * 1
│  │  │  where R1 = 1 (from Step 7)
│  │  │  =&gt; R = 2
│  │  └─
│  │  =&gt; R1 = 2
│  └─
│  ┌─ Step 13 [Goal 1.4]: R is N * R1 → R is 3 * 2
│  │  where R1 = 2 (from Step 4)
│  │  =&gt; R = 6
│  └─
│  =&gt; X = 6
└─

</pre>

## Call Tree

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%
graph TD

%% Nodes
A["?- factorial(3, X)"]
B["① factorial(3, X)<br/>X = 6 · clause 5"]
C["② N &gt; 0"]
D["③ N1 is N - 1"]
E["④ factorial(N1, R1)<br/>R1 = 2 · clause 5"]
F["⑤ N &gt; 0"]
G["⑥ N1 is N - 1"]
H["⑦ factorial(N1, R1)<br/>R1 = 1 · clause 5"]
I["⑧ N &gt; 0"]
J["⑨ N1 is N - 1"]
K["⑩ factorial(N1, R1)<br/>R1 = 1 · fact 4"]
L["⑪ R is N * 1"]
M["⑫ R is N * 1"]
N["⑬ R is N * 2"]
O["✓ X = 6"]

%% Flow
A --> B
B --> C
C --> D
D --> E
E --> F
F --> G
G --> H
H --> I
I --> J
J --> K
K --> L
H --> M
E --> N
B --> O

%% Styles
style A fill:#e1f5ff,stroke:#01579b,stroke-width:3px,color:#0b2440
style B fill:#c8e6c9,stroke:#388e3c,color:#14361a
style C fill:#c8e6c9,stroke:#388e3c,color:#14361a
style D fill:#c8e6c9,stroke:#388e3c,color:#14361a
style E fill:#c8e6c9,stroke:#388e3c,color:#14361a
style F fill:#c8e6c9,stroke:#388e3c,color:#14361a
style G fill:#c8e6c9,stroke:#388e3c,color:#14361a
style H fill:#c8e6c9,stroke:#388e3c,color:#14361a
style I fill:#c8e6c9,stroke:#388e3c,color:#14361a
style J fill:#c8e6c9,stroke:#388e3c,color:#14361a
style K fill:#c8e6c9,stroke:#388e3c,color:#14361a
style L fill:#c8e6c9,stroke:#388e3c,color:#14361a
style M fill:#c8e6c9,stroke:#388e3c,color:#14361a
style N fill:#c8e6c9,stroke:#388e3c,color:#14361a
style O fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px,color:#14361a
```

## Final Answer

```
X = 6
```

_Showing the first solution only — re-run with `-n <count>` or `--all` to see more._