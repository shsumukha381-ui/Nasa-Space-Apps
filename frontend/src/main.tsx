import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('AstroTwin root element is missing.');

createRoot(container).render(<App />);
import { createRoot } from "react-dom/client"
import App from "./App.tsx"
import BackgroundVideo from "./BackgroundVideo.tsx"
import './index.css'
import './theme.css'

const root = createRoot(document.getElementById("root")!);

root.render(
    <>
        <BackgroundVideo />
        <App />
    </>
)
