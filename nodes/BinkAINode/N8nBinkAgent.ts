import { 
    AgentConfig, 
    BaseAgent, 
    IModel, 
    IWallet, 
    NetworksConfig, 
    AgentExecuteParams, 
    DatabaseAdapter,
    IPlugin, 
} from "@binkai/core";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createOpenAIToolsAgent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { MessagesPlaceholder } from "@langchain/core/prompts";
import { fixEmptyContentMessage, getAgentStepsParser } from "../../utils/common";
import { RunnableSequence } from "@langchain/core/runnables";
import { BaseChatMemory } from "@langchain/community/memory/chat_memory";
import { N8nOutputParser } from "../../utils/output_parsers/N8nOutputParser";

export class N8nBinkAgent extends BaseAgent {
    private model: IModel;
    private wallet: IWallet;
    private networks: NetworksConfig['networks'];
    private config: AgentConfig;
    private memory: BaseChatMemory;
    private outputParser: N8nOutputParser;
    constructor(
        model: IModel, 
        memory: BaseChatMemory,
        outputParser: N8nOutputParser,
        config: AgentConfig, 
        wallet: IWallet, 
        networks: NetworksConfig['networks'],
    ) {
        super();
        this.model = model;
        this.memory = memory;
        this.outputParser = outputParser;
        this.config = config;
        this.wallet = wallet;
        this.networks = networks;
    }


    protected async onToolsUpdated(): Promise<void> {}

    public isMockResponseTool(): boolean {
        return false;
    }

    async registerPlugin(plugin: IPlugin): Promise<void> {
        const pluginName = plugin.getName();
        this.plugins.set(pluginName, plugin);
    
        // Register all tools from the plugin
        const tools = plugin.getTools();
        for (const tool of tools) {
          await this.registerTool(tool);
        }
    }

    protected async createExecutor(): Promise<AgentExecutor > {
        const defaultSystemPrompt = `You are a helpful assistant that can help with tasks related to the BinkAI platform.`;


        const agent = await createOpenAIToolsAgent({
            llm: this.getModel().getLangChainLLM(),
            tools: this.tools,
            prompt: ChatPromptTemplate.fromMessages([
                ['system', `${this.config.systemPrompt ?? defaultSystemPrompt}`],
                ['human', '{input}'],
                new MessagesPlaceholder('agent_scratchpad'),
            ]),
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
        const executor = await this.createExecutor();
        if (typeof command === 'string') {
            
            return executor.invoke(
                {input: command},
            );
        }
        return executor.invoke(command);
    }

    public getNetworks(): NetworksConfig['networks'] {
        return this.networks;
    }

    public async registerDatabase<T>(db: DatabaseAdapter<T>): Promise<void> {
        // Implementation for registering database
    }
}