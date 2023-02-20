import { config } from "../../package.json";

export function registerPrompt() {
  let getSelection = () => {
    return ztoolkit.Reader.getSelectedText(
      Zotero.Reader.getByTabID(Zotero_Tabs.selectedID)
    );
  }
  ztoolkit.Prompt.register([{
    name: "Translate Sentences",
    label: config.addonInstance,
    when: () => {
      const selection = getSelection();
      const sl = Zotero.Prefs.get("ZoteroPDFTranslate.sourceLanguage") as string
      const tl = Zotero.Prefs.get("ZoteroPDFTranslate.targetLanguage") as string
      return selection.length > 0 && Zotero?.PDFTranslate && sl.startsWith("en") && tl.startsWith("zh")
    },
    callback: async (prompt) => {
      const selection = getSelection();
      const queue = Zotero.PDFTranslate.data.translate.queue
      let task = queue.find((task: any) => task.raw == selection && task.result.length > 0)
      task = null
      if (!task) {
        prompt.showTip("Loading...")
        task = await Zotero.PDFTranslate.api.translate(selection)
        Zotero.PDFTranslate.data.translate.queue.push(task)
        // @ts-ignore
        prompt.exit()
      }
      prompt.inputNode.placeholder = task.service
      const rawText = task.raw, resultText = task.result;

      let addSentences = (node: HTMLElement, text: string, dividers: string[]) => {
        let i = 0
        let sentences: string[] = []
        let sentence = ""
        // https://www.npmjs.com/package/sentence-extractor?activeTab=explore
        const abbrs = ["a.m.", "p.m.", "etc.", "vol.", "inc.", "jr.", "dr.", "tex.", "co.", "prof.", "rev.", "revd.", "hon.", "v.s.", "ie.",
          "eg.", "e.g.", "et al.", "st.", "ph.d.", "capt.", "mr.", "mrs.", "ms."]
        const abbrLength = 2
        let isAbbr = (i: number) => {
          return abbrs.find((abbr: string) => {
            return (
              i >= abbr.length && text[i - abbr.length] == " " &&
              text.slice(i - abbr.length + 1, i + 1).toLowerCase() == abbr.toLowerCase()
            )
          })
        }
        let isNumber = (i: number) => {
          return i - 1 >= 0 && /\d/.test(text[i - 1]) && i + 1 < text.length && /\d/.test(text[i + 1])
        }
        while (i < text.length) {
          let char = text[i]
          sentence += char
          if (dividers.indexOf(char) != -1) {
            if (char == ".") {
              if (isAbbr(i) || isNumber(i)) {
                i += 1
                continue
              }
            }
            const blank = " "
            i += 1
            while (text[i] == blank) {
              sentence += blank
              i += 1
            }
            sentences.push(sentence)
            sentence = ""
            continue
          }
          i += 1
        }
        for (let i = 0; i < sentences.length; i++) {
          ztoolkit.UI.appendElement(
            {
              tag: "span",
              id: `sentence-${i}`,
              properties: {
                innerText: sentences[i]
              },
              styles: {
                borderRadius: "3px"
              },
              listeners: [
                {
                  type: "mousemove",
                  listener: function () {
                    const highlightColor = "#fee972"
                    // @ts-ignore
                    const span = this as HTMLSpanElement
                    const parentNode = span.parentNode as HTMLDivElement
                    parentNode?.querySelectorAll("span").forEach(e => e.style.backgroundColor = "")
                    span.style.backgroundColor = highlightColor
                    const siblingNode = (parentNode?.previousSibling?.previousSibling || parentNode?.nextSibling?.nextSibling) as HTMLDivElement
                    siblingNode?.querySelectorAll("span").forEach(e => e.style.backgroundColor = "");
                    const twinSpan = siblingNode.querySelector(`span[id=sentence-${i}]`) as HTMLSpanElement
                    twinSpan.style.backgroundColor = highlightColor;
                    if (direction == "column" && siblingNode.classList.contains("result")) {
                      siblingNode.scrollTo(0, twinSpan.offsetTop - siblingNode.offsetHeight * .5 - parentNode.offsetHeight);
                    } else {
                      siblingNode.scrollTo(0, twinSpan.offsetTop - siblingNode.offsetHeight * .5);
                    }
                  }
                }
              ]
            },
            node
          )
        }
      }
      const container = prompt.createCommandsContainer() as HTMLDivElement
      // TODO: prefs: direction
      const directions = ["row", "column"]
      const direction = directions[1]
      container.setAttribute("style", `
          display: flex;
          flex-direction: ${direction};
          padding: .5em 1em;
          margin-left: 0px;
          width: 100%;
          height: 25em;
        `)
      const props = {
        styles: {
          height: "100%",
          width: "100%",
          minWidth: "10em",
          minHeight: "5em",
          border: "1px solid #eee",
          textAlign: "justify",
          padding: ".5em",
          fontSize: "1em",
          lineHeight: "1.5em",
          overflowY: "auto"
        },
      }
      const rawDiv = ztoolkit.UI.createElement(document, "div", {
        ...props,
        classList: ["raw"]
      })

      addSentences(rawDiv, rawText, [".", ";", "?", "!"])
      const resultDiv = ztoolkit.UI.createElement(document, "div", {
        ...props,
        classList: ["result"]
      })
      addSentences(resultDiv, resultText, [";", "?", "!", "！", "；", "。", "？"])
      const size = 5
      const resizer = ztoolkit.UI.createElement(document, "div", {
        styles: {
          height: (direction == "row" ? "100%" : `${size}px`),
          width: (direction == "column" ? "100%" : `${size}px`),
          backgroundColor: "#f0f0f0",
          cursor: direction == "column" ? "ns-resize" : "ew-resize",
        },
      })
      // 可调
      let y = 0, x = 0;
      let h = 0, w = 0;
      const rect = container.getBoundingClientRect();
      const H = rect.height;
      const W = rect.width;
      const mouseDownHandler = function (e: MouseEvent) {
        // hide
        [rawDiv, resultDiv].forEach(div => {
          div.querySelectorAll("span").forEach((e: HTMLSpanElement) => e.style.display = "none")
        })
        y = e.clientY;
        x = e.clientX;
        const rect = resultDiv.getBoundingClientRect()
        h = rect.height;
        w = rect.width;
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
      };
      const mouseMoveHandler = function (e: MouseEvent) {
        const dy = e.clientY - y;
        const dx = e.clientX - x;
        if (direction == "column") {
          resultDiv.style.height = `${h - dy}px`;
          rawDiv.style.height = `${H - (h - dy) - size}px`;
        }
        if (direction == "row") {
          resultDiv.style.width = `${w - dx}px`;
          rawDiv.style.width = `${W - (w - dx) - size}px`;
        }
      };
      const mouseUpHandler = function () {
        // show
        [rawDiv, resultDiv].forEach(div => {
          div.querySelectorAll("span").forEach((e: HTMLSpanElement) => e.style.display = "")
        })
        document.removeEventListener('mousemove', mouseMoveHandler);
        document.removeEventListener('mouseup', mouseUpHandler);
      };
      resizer.addEventListener('mousedown', mouseDownHandler);
      container.append(rawDiv, resizer, resultDiv)
    }
  }])
}
