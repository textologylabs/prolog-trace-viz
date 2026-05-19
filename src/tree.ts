/**
 * Tree Builder - Constructs hierarchical call tree from trace events
 */

import { TraceEvent } from './timeline.js';
import { SourceClauseMap } from './clauses.js';

export interface TreeNode {
  id: string;                   // e.g., "A", "B", "C", ..., "Z", "AA", "AB"
  goal: string;
  clauseHead?: string;          // Source clause head with original variables
  clauseNumber?: string;        // e.g., "26", "26.1", "26.2"
  callStep: number;
  exitStep?: number;
  status: 'success' | 'failure' | 'pending';
  children: TreeNode[];
  finalBinding?: string;
  subgoals?: Array<{ label: string; goal: string }>; // Subgoals spawned by this node
}

/**
 * Tree Builder class - constructs call tree from trace events
 */
export class TreeBuilder {
  private nodes: TreeNode[] = [];
  private nodeCounter = 0;
  private callStack: Map<number, TreeNode> = new Map(); // level -> node
  private stepToNode: Map<number, TreeNode> = new Map(); // step number -> node
  private stepCounter = 0;

  constructor(private events: TraceEvent[], private sourceClauseMap?: SourceClauseMap, private timeline?: any[]) {}

  /**
   * Check if a predicate is part of tracer infrastructure and should be filtered
   */
  private isTracerPredicate(predicate: string): boolean {
    const tracerPredicates = [
      'catch/3',
      'export_trace_json/1',
      'run_trace/0',
      'install_tracer/1',
      'remove_tracer/0',
    ];
    return tracerPredicates.includes(predicate);
  }

  /**
   * Build the complete tree from trace events
   */
  build(): TreeNode | null {
    let root: TreeNode | null = null;

    // Build event-to-timeline-step map if timeline provided
    const eventStepToTimelineStep = new Map<number, number>();
    if (this.timeline) {
      let eventStep = 0;
      for (const event of this.events) {
        if (this.isTracerPredicate(event.predicate)) {
          continue;
        }
        eventStep++;
        
        // Find corresponding timeline step
        // Timeline steps are merged CALL/EXIT pairs, so we need to find which timeline step
        // corresponds to this event step
        const timelineStep = this.timeline.find(ts => {
          // For CALL events, match by level and goal
          if (event.port === 'call') {
            return ts.level === event.level && ts.goal === event.goal && (ts.port === 'call' || ts.port === 'merged');
          }
          // For EXIT events, they're merged into CALL steps, so skip
          return false;
        });
        
        if (timelineStep) {
          eventStepToTimelineStep.set(eventStep, timelineStep.stepNumber);
        }
      }
    }

    for (const event of this.events) {
      // Filter out tracer infrastructure
      if (this.isTracerPredicate(event.predicate)) {
        continue;
      }

      this.stepCounter++;
      
      // Map to timeline step if available
      const timelineStepNumber = eventStepToTimelineStep.get(this.stepCounter) || this.stepCounter;
      
      switch (event.port) {
        case 'call':
          const node = this.processCall(event, timelineStepNumber);
          if (!root) {
            root = node;
          }
          break;
        case 'exit':
          this.processExit(event, timelineStepNumber);
          break;
        case 'redo':
          // REDO: the goal is backtracking into a different clause. Discard
          // the failed clause attempt's subtree so the tree shows only the
          // derivation that ultimately succeeds.
          this.discardFailedAttempt(event.level);
          break;
        case 'fail':
          this.processFail(event, timelineStepNumber);
          break;
      }
    }
    
    // Backfill clause info from EXIT events to nodes
    if (root) {
      this.backfillClauseInfo();
    }

    return root;
  }
  
  /**
   * Backfill clause information from EXIT events to nodes
   * CALL events don't have clause info, only EXIT events do
   */
  private backfillClauseInfo(): void {
    // For each node, find its EXIT event to get clause info
    for (const node of this.nodes) {
      if (!node.clauseHead && node.clauseNumber && this.sourceClauseMap) {
        const lineNumber = parseInt(node.clauseNumber);
        const sourceClause = this.sourceClauseMap[lineNumber];
        if (sourceClause) {
          node.clauseHead = sourceClause.head;
          
          // Extract subgoals from clause body
          if (sourceClause.body && sourceClause.body !== 'true') {
            const subgoalGoals = this.extractSubgoals(sourceClause.body);
            node.subgoals = subgoalGoals.map((goal, index) => ({
              label: `[${node.callStep}.${index + 1}]`,
              goal,
            }));
          }
        }
      }
    }
  }

  /**
   * Generate node ID (A-Z, AA-AZ, BA-BZ, ...)
   */
  private generateNodeId(): string {
    const index = this.nodeCounter++;
    
    if (index < 26) {
      return String.fromCharCode(65 + index); // A-Z
    }
    
    // After Z: AA, AB, AC, ..., AZ, BA, BB, ...
    const firstChar = String.fromCharCode(65 + Math.floor(index / 26) - 1);
    const secondChar = String.fromCharCode(65 + (index % 26));
    return firstChar + secondChar;
  }

  /**
   * Process CALL event - create new node
   */
  private processCall(event: TraceEvent, stepNumber: number): TreeNode {
    // Get source clause if available
    let clauseHead: string | undefined;
    let subgoals: Array<{ label: string; goal: string }> | undefined;
    
    if (event.clause && this.sourceClauseMap) {
      const sourceClause = this.sourceClauseMap[event.clause.line];
      if (sourceClause) {
        clauseHead = sourceClause.head;
        
        // Extract subgoals from clause body
        if (sourceClause.body && sourceClause.body !== 'true') {
          const subgoalGoals = this.extractSubgoals(sourceClause.body);
          subgoals = subgoalGoals.map((goal, index) => ({
            label: `[${stepNumber}.${index + 1}]`,
            goal,
          }));
        }
      }
    }
    
    const node: TreeNode = {
      id: this.generateNodeId(),
      goal: event.goal,
      clauseHead,
      clauseNumber: event.clause?.line.toString(),
      callStep: stepNumber,
      status: 'pending',
      children: [],
      subgoals,
    };

    // Add as child to parent if there is one
    const parentLevel = event.level - 1;
    const parent = this.callStack.get(parentLevel);
    if (parent) {
      parent.children.push(node);
    }

    // Track in call stack
    this.callStack.set(event.level, node);
    this.stepToNode.set(stepNumber, node);
    this.nodes.push(node);

    return node;
  }
  
  /**
   * Extract subgoals from a clause body
   */
  private extractSubgoals(clauseBody: string): string[] {
    if (!clauseBody || clauseBody === 'true') {
      return [];
    }
    
    // Split on commas, respecting parentheses depth
    const subgoals: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of clauseBody) {
      if (char === '(') {
        depth++;
        current += char;
      } else if (char === ')') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        subgoals.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      subgoals.push(current.trim());
    }
    
    return subgoals;
  }

  /**
   * Process EXIT event - mark node as successful
   */
  private processExit(event: TraceEvent, stepNumber: number): void {
    const node = this.callStack.get(event.level);
    if (node) {
      node.exitStep = stepNumber;
      node.status = 'success';
      
      // Store clause number from EXIT event
      if (event.clause && !node.clauseNumber) {
        node.clauseNumber = event.clause.line.toString();
      }
      
      // Extract final binding if available
      // Compare CALL goal with EXIT goal to find bindings
      const callGoal = node.goal;
      const exitGoal = event.goal;
      if (callGoal !== exitGoal) {
        node.finalBinding = this.extractBinding(callGoal, exitGoal);
      }

      // Builtin goals (is/2, comparisons) have no clause. Their CALL goal can
      // contain unresolved internal vars (e.g. "_3154 is 16-10"); the EXIT
      // goal has them resolved ("6 is 16-10"), so prefer it for display.
      if (!event.clause && !node.clauseHead && !node.clauseNumber) {
        node.goal = exitGoal;
      }

      // Remove from call stack
      this.callStack.delete(event.level);
    }
  }

  /**
   * Discard the failed clause attempt for the goal at the given level.
   * Removes the node's descendants (the work done by the clause that failed)
   * and clears its clause info so it is re-derived from the next CALL/EXIT.
   */
  private discardFailedAttempt(level: number): void {
    const node = this.callStack.get(level);
    if (!node) return;

    const removed = new Set<TreeNode>();
    const collect = (n: TreeNode): void => {
      for (const child of n.children) {
        removed.add(child);
        collect(child);
      }
    };
    collect(node);

    if (removed.size > 0) {
      this.nodes = this.nodes.filter(n => !removed.has(n));
    }
    node.children = [];
    node.clauseHead = undefined;
    node.clauseNumber = undefined;
    node.subgoals = undefined;
  }

  /**
   * Process FAIL event - mark node as failed
   */
  private processFail(event: TraceEvent, stepNumber: number): void {
    const node = this.callStack.get(event.level);
    if (node) {
      node.exitStep = stepNumber;
      node.status = 'failure';
      
      // Remove from call stack
      this.callStack.delete(event.level);
    }
  }

  /**
   * Extract binding by comparing CALL and EXIT goals
   */
  private extractBinding(callGoal: string, exitGoal: string): string | undefined {
    // Simple extraction - find the first variable that changed
    const callMatch = callGoal.match(/^([^(]+)\((.*)\)$/);
    const exitMatch = exitGoal.match(/^([^(]+)\((.*)\)$/);
    
    if (!callMatch || !exitMatch) {
      return undefined;
    }
    
    const callArgs = this.splitArguments(callMatch[2]);
    const exitArgs = this.splitArguments(exitMatch[2]);
    
    // Find first differing argument where call has variable
    for (let i = 0; i < Math.min(callArgs.length, exitArgs.length); i++) {
      const callArg = callArgs[i].trim();
      const exitArg = exitArgs[i].trim();
      
      if (callArg !== exitArg && /^[A-Z_]/.test(callArg)) {
        return `${callArg}=${exitArg}`;
      }
    }
    
    return undefined;
  }

  /**
   * Split arguments respecting parentheses and brackets
   */
  private splitArguments(argsStr: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    
    for (const char of argsStr) {
      if (char === '(' || char === '[') {
        depth++;
        current += char;
      } else if (char === ')' || char === ']') {
        depth--;
        current += char;
      } else if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    if (current.trim()) {
      args.push(current.trim());
    }
    
    return args;
  }
}
