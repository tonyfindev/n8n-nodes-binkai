import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { IModel } from '@binkai/core';

export abstract class BaseModel implements IModel {
	abstract getLangChainLLM(): BaseChatModel;
	// abstract getN8nLLM(): N8nLLM;
}

export class N8nLLM extends BaseModel {
	private model;
	getLangChainLLM(): BaseChatModel {
		return this.model;
	}
	constructor(model: unknown) {
		super();
		this.model = model;
	}
}
