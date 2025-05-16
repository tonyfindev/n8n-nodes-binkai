import { 
    AgentConfig, 
    BaseAgent, 
    IModel, 
    IWallet, 
    NetworksConfig, 
    AgentExecuteParams, 
    DatabaseAdapter, 
} from "@binkai/core";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createOpenAIToolsAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { MessagesPlaceholder } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { fixEmptyContentMessage, getAgentStepsParser } from "../../utils/common";
import { RunnableSequence } from "@langchain/core/runnables";
import { BaseChatMemory } from "@langchain/community/memory/chat_memory";
import { N8nOutputParser } from "../../utils/output_parsers/N8nOutputParser";
export class n8nBinkAgent extends BaseAgent {
    private model: IModel;
    private wallet: IWallet;
    private networks: NetworksConfig['networks'];
    private config: AgentConfig;
    protected tools: DynamicStructuredTool[];
    private memory: BaseChatMemory;
    private outputParser: N8nOutputParser;
    constructor(
        model: IModel, 
        memory: BaseChatMemory,
        outputParser: N8nOutputParser,
        tools: DynamicStructuredTool[],
        config: AgentConfig, 
        wallet: IWallet, 
        networks: NetworksConfig['networks'],
    ) {
        super();
        this.model = model;
        this.memory = memory;
        this.outputParser = outputParser;
        this.tools = tools;
        this.config = config;
        this.wallet = wallet;
        this.networks = networks;
    }


    protected async onToolsUpdated(): Promise<void> {}

    public isMockResponseTool(): boolean {
        return false;
    }

    protected async createExecutor(): Promise<AgentExecutor > {
    const defaultSystemPrompt = `You are a helpful assistant that can help with tasks related to the BinkAI platform.`;

    const prompt = ChatPromptTemplate.fromMessages([
        ['system', `${this.config.systemPrompt ?? defaultSystemPrompt}`],
        new MessagesPlaceholder('chat_history'),
        ['human', '{input}'],
        new MessagesPlaceholder('agent_scratchpad'),
    ]);

    const agent = await createOpenAIToolsAgent({
        llm: this.getModel().getLangChainLLM(),
        tools: this.tools,
        prompt,
    });

    const runnableAgent = RunnableSequence.from([
        agent,
        getAgentStepsParser(this.outputParser, this.memory),
        fixEmptyContentMessage,
    ]);

    return AgentExecutor.fromAgentAndTools({
        agent: runnableAgent,
        memory: this.memory,
        tools: this.tools,
    });
  }
    

    public getWallet(): IWallet {
        return this.wallet;
    }


    public getModel(): IModel {
        return this.model;
    }

    public async execute(command: string | AgentExecuteParams, onStream?: (data: string) => void): Promise<any> {
        if (typeof command === 'string') {
            return this.model.getLangChainLLM().invoke(command);
        }
        return this.model.getLangChainLLM().invoke((command as AgentExecuteParams).input);
    }

    public getNetworks(): NetworksConfig['networks'] {
        return this.networks;
    }

    public async registerDatabase<T>(db: DatabaseAdapter<T>): Promise<void> {
        // Implementation for registering database
    }
}