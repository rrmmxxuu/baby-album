package store

// AgentJobNotifier wakes waiting agent job requests for a specific node.
type AgentJobNotifier func(nodeID string)
