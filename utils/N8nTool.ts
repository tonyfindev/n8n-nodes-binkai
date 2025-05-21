import type { DynamicStructuredToolInput } from '@langchain/core/tools';
import { DynamicStructuredTool, DynamicTool } from '@langchain/core/tools';
import { StructuredOutputParser } from 'langchain/output_parsers';
import type { ISupplyDataFunctions, IDataObject } from 'n8n-workflow';
import { NodeConnectionType, jsonParse, NodeOperationError } from 'n8n-workflow';
import type { ZodTypeAny } from 'zod';
import { ZodBoolean, ZodNullable, ZodNumber, ZodObject, ZodOptional } from 'zod';

const getSimplifiedType = (schema: ZodTypeAny) => {
	if (schema instanceof ZodObject) {
		return 'object';
	} else if (schema instanceof ZodNumber) {
		return 'number';
	} else if (schema instanceof ZodBoolean) {
		return 'boolean';
	} else if (schema instanceof ZodNullable || schema instanceof ZodOptional) {
		return getSimplifiedType(schema.unwrap());
	}

	return 'string';
};

const getParametersDescription = (parameters: Array<[string, ZodTypeAny]>) =>
	parameters
		.map(
			([name, schema]) =>
				`${name}: (description: ${schema.description ?? ''}, type: ${getSimplifiedType(schema)}, required: ${!schema.isOptional()})`,
		)
		.join(',\n ');

export const prepareFallbackToolDescription = (toolDescription: string, schema: ZodObject<any>) => {
	let description = `${toolDescription}`;

	const toolParameters = Object.entries<ZodTypeAny>(schema.shape);

	if (toolParameters.length) {
		description += `
Tool expects valid stringified JSON object with ${toolParameters.length} properties.
Property names with description, type and required status:
${getParametersDescription(toolParameters)}
ALL parameters marked as required must be provided`;
	}

	return description;
};

export class N8nTool extends DynamicStructuredTool {
	constructor(
		private context: ISupplyDataFunctions,
		fields: DynamicStructuredToolInput,
	) {
		super(fields);
	}

	asDynamicTool(): DynamicTool {
		const { name, func, schema, context, description } = this;
		
		// Replace StructuredOutputParser with a simpler approach
		const parseInput = async (input: string) => {
			try {
				return jsonParse<IDataObject>(input, { acceptJSObject: true });
			} catch (error) {
				// Use type assertion to handle schema differences
				// Attempt to check if it's a simple schema with one property
				const schemaProperties = (schema as any).properties || (schema as any).shape;
				if (schemaProperties && Object.keys(schemaProperties).length === 1) {
					const parameterName = Object.keys(schemaProperties)[0];
					return { [parameterName]: input };
				}
				throw error;
			}
		};

		const wrappedFunc = async function (query: string) {
			let parsedQuery: object;

			try {
				parsedQuery = await parseInput(query);
			} catch (error) {
				throw new NodeOperationError(
					context.getNode(),
					`Input is not a valid JSON: ${error.message}`,
				);
			}

			try {
				// Call tool function with parsed query
				const result = await func(parsedQuery);

				return result;
			} catch (e) {
				const { index } = context.addInputData(NodeConnectionType.AiTool, [[{ json: { query } }]]);
				void context.addOutputData(NodeConnectionType.AiTool, index, e);

				return e.toString();
			}
		};

		return new DynamicTool({
			name,
			// Avoid using prepareFallbackToolDescription since schema type doesn't match
			description: description || this.description,
			func: wrappedFunc,
		});
	}
}
