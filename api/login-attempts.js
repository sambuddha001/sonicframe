import loginAttemptsHandler from '../netlify/functions/login-attempts.js';
import { createVercelHandler } from './_adapter.js';

export default createVercelHandler(loginAttemptsHandler);
