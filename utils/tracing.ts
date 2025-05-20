import type { BaseCallbackConfig } from '@langchain/core/callbacks/manager';
import type { IExecuteFunctions } from 'n8n-workflow';
import { N8nBinkAgent } from '../nodes/N8NBase/N8nBinkAgent';

interface TracingConfig {
	additionalMetadata?: Record<string, unknown>;
}

export function getTracingConfig(
	context: IExecuteFunctions,
	config: TracingConfig = {},
): BaseCallbackConfig {
	const parentRunManager = context.getParentCallbackManager
		? context.getParentCallbackManager()
		: undefined;

	return {
		runName: `[${context.getWorkflow().name}] ${context.getNode().name}`,
		metadata: {
			execution_id: context.getExecutionId(),
			workflow: context.getWorkflow(),
			node: context.getNode().name,
			...(config.additionalMetadata ?? {}),
		},
		callbacks: parentRunManager,
	};
}

// Custom tracing config for N8nBinkAgent
export function getAgentTracingConfig(agent: N8nBinkAgent): BaseCallbackConfig {
	return {
		runName: `N8nBinkAgent-${agent.typeAgent}`,
		metadata: {
			agentType: agent.typeAgent,
		},
	};
}
