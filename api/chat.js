import chatHandler from '../netlify/functions/chat.js';
import { createVercelHandler } from './_adapter.js';

export default createVercelHandler(chatHandler);
