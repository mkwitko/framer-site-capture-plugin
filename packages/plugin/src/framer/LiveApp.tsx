import { framer, useIsAllowedTo } from "@framer/plugin"
import { Panel, type PanelApi } from "../App.tsx"
import { capture } from "../capture/client.ts"
import { readProject } from "./project.ts"

framer.showUI({ position: "top right", width: 320, height: 520, resizable: true })

export default function LiveApp() {
  const api: PanelApi = {
    canInsert: useIsAllowedTo("addImage"),
    readProject,
    capture: (url, signal) => capture(url, ["desktop", "mobile"], signal),
    insert: (file, name) => framer.addImage({ image: file, name }),
  }
  return <Panel api={api} />
}
