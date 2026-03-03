import type { Workflow, WorkflowNode, WorkflowEdge } from './workflow.js';

export interface ValidationIssue {
  code: string;
  message: string;
  path?: string;
  severity: 'error' | 'warning';
}

export interface WorkflowValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates a parsed Workflow object for structural correctness beyond
 * what the Zod schema can express (graph topology, edge completeness, etc.).
 */
export function validateWorkflow(workflow: Workflow): WorkflowValidationResult {
  const issues: ValidationIssue[] = [];
  const nodeMap = new Map<string, WorkflowNode>();

  for (const node of workflow.nodes) {
    if (nodeMap.has(node.id)) {
      issues.push({ code: 'DUPLICATE_NODE_ID', message: `Duplicate node id: "${node.id}"`, path: `nodes.${node.id}`, severity: 'error' });
    }
    nodeMap.set(node.id, node);
  }

  // ─── Edge references ────────────────────────────────────────────
  for (const edge of workflow.edges) {
    if (!nodeMap.has(edge.from)) {
      issues.push({ code: 'DANGLING_EDGE_FROM', message: `Edge from unknown node "${edge.from}"`, path: `edges.${edge.from}->${edge.to}`, severity: 'error' });
    }
    if (!nodeMap.has(edge.to)) {
      issues.push({ code: 'DANGLING_EDGE_TO', message: `Edge to unknown node "${edge.to}"`, path: `edges.${edge.from}->${edge.to}`, severity: 'error' });
    }
  }

  // ─── Condition nodes must have true + false edges ───────────────
  for (const node of workflow.nodes) {
    if (node.type !== 'condition') continue;
    const outEdges = workflow.edges.filter(e => e.from === node.id);
    const labels = new Set(outEdges.map(e => e.label));
    if (!labels.has('true')) {
      issues.push({ code: 'MISSING_TRUE_EDGE', message: `Condition node "${node.id}" has no "true" edge`, path: `nodes.${node.id}`, severity: 'error' });
    }
    if (!labels.has('false')) {
      issues.push({ code: 'MISSING_FALSE_EDGE', message: `Condition node "${node.id}" has no "false" edge`, path: `nodes.${node.id}`, severity: 'error' });
    }
  }

  // ─── Action / transform / delay nodes should have a "next" edge ─
  for (const node of workflow.nodes) {
    if (!['action', 'transform', 'delay'].includes(node.type)) continue;
    const outEdges = workflow.edges.filter(e => e.from === node.id);
    if (outEdges.length === 0) {
      issues.push({ code: 'NO_OUTGOING_EDGE', message: `Node "${node.id}" (${node.type}) has no outgoing edge`, path: `nodes.${node.id}`, severity: 'warning' });
    }
  }

  // ─── At least one 'end' node ────────────────────────────────────
  const endNodes = workflow.nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    issues.push({ code: 'NO_END_NODE', message: 'Workflow has no "end" node', severity: 'warning' });
  }

  // ─── Orphan detection: all nodes reachable from first edge ──────
  const reachable = computeReachableNodes(workflow.nodes, workflow.edges);
  for (const node of workflow.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({ code: 'ORPHAN_NODE', message: `Node "${node.id}" is not reachable from any incoming edge`, path: `nodes.${node.id}`, severity: 'warning' });
    }
  }

  // ─── Cycle detection (DAG check) ───────────────────────────────
  const cycleNodes = detectCycles(workflow.nodes, workflow.edges);
  if (cycleNodes.length > 0) {
    issues.push({ code: 'CYCLE_DETECTED', message: `Cycle detected involving nodes: ${cycleNodes.join(', ')}`, severity: 'warning' });
  }

  // ─── End nodes should have no outgoing edges ────────────────────
  for (const node of endNodes) {
    const outEdges = workflow.edges.filter(e => e.from === node.id);
    if (outEdges.length > 0) {
      issues.push({ code: 'END_NODE_HAS_EDGES', message: `End node "${node.id}" should not have outgoing edges`, path: `nodes.${node.id}`, severity: 'error' });
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues,
  };
}

/**
 * BFS reachability from nodes that appear as targets of no edge (start nodes)
 * or from the first node in the array (if all have incoming edges, e.g. cycles).
 */
function computeReachableNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): Set<string> {
  const adj = new Map<string, string[]>();
  const hasIncoming = new Set<string>();

  for (const edge of edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
    hasIncoming.add(edge.to);
  }

  const startNodes = nodes.filter(n => !hasIncoming.has(n.id));
  const seeds = startNodes.length > 0 ? startNodes.map(n => n.id) : (nodes[0] ? [nodes[0].id] : []);

  const visited = new Set<string>();
  const queue = [...seeds];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of (adj.get(current) ?? [])) {
      if (!visited.has(next)) queue.push(next);
    }
  }

  // Start nodes themselves are also reachable
  for (const s of seeds) visited.add(s);

  return visited;
}

/**
 * Kahn's algorithm for topological sort — returns nodes involved in cycles.
 */
function detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }

  for (const edge of edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed++;
    for (const next of (adj.get(current) ?? [])) {
      const deg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, deg);
      if (deg === 0) queue.push(next);
    }
  }

  if (processed === nodes.length) return [];

  return nodes.filter(n => (inDegree.get(n.id) ?? 0) > 0).map(n => n.id);
}
