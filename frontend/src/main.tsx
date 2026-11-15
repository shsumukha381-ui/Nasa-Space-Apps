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