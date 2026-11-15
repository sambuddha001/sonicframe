import orchestrateHandler from '../netlify/functions/orchestrate.js';
import { createVercelHandler } from './_adapter.js';

export default createVercelHandler(orchestrateHandler);
