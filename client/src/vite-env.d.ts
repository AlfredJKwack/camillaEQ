/// <reference types="vite/client" />

// Declare module for raw SVG imports
declare module '*.svg?raw' {
  const content: string;
  export default content;
}
