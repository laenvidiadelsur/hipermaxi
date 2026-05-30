import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ProductService } from '../services/productService.js';
import { OrderService } from '../services/orderService.js';

export const mcpServer = new Server(
  {
    name: 'hipermaxi-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Registrar las herramientas MCP
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'buscar_productos',
        description: 'Busca productos en el catalogo por nombre o codigo de barras',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Texto a buscar' }
          }
        }
      },
      {
        name: 'verificar_stock',
        description: 'Verifica la disponibilidad y precio de un producto especifico',
        inputSchema: {
          type: 'object',
          properties: {
            barcode: { type: 'string', description: 'Codigo de barras del producto' }
          },
          required: ['barcode']
        }
      },
      {
        name: 'crear_pedido_rapido',
        description: 'Crea un pedido inmediatamente usando el stock disponible',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
            barcode: { type: 'string' },
            quantity: { type: 'number' }
          },
          required: ['userId', 'barcode', 'quantity']
        }
      }
    ],
  };
});

// Manejar la ejecucion de las herramientas MCP
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'buscar_productos') {
      const results = ProductService.search(args.query);
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    } 
    
    else if (name === 'verificar_stock') {
      const result = ProductService.checkStock(args.barcode);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } 
    
    else if (name === 'crear_pedido_rapido') {
      const result = OrderService.createQuickOrder(args.userId, args.barcode, args.quantity);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    throw new Error(`Herramienta no encontrada: ${name}`);
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error('MCP Server ejecutandose en stdio');
}
