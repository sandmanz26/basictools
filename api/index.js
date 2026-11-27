// Vercel Function: every /api/* request is rewritten here (see vercel.json).
// The code lives in server/ and is compiled to server/dist by the build command.
export { default } from '../server/dist/vercel.js'
