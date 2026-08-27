# Evidence labels

Use one of these labels for every protocol claim. Do not collapse distinct sources into a stronger label.

| Label | Meaning | What it proves |
| --- | --- | --- |
| `official-generated-code` | Name, enum, or message metadata recovered from the selected official client module | The selected client version defines the symbol or relationship |
| `official-encoder-probe` | A minimal sentinel was encoded by an official generated message type and its tag was decoded | Field number and wire type for that property in the selected client |
| `official-encoder-reconstruction` | A complete semantic object was encoded by official generated types | The reported bytes are reproducible for that object; it is not observed network traffic |
| `historical-plaintext-capture` | Previously captured HAR/WS payload was demonstrably plaintext and decoded | The captured client/server exchange used those bytes at that time |
| `encrypted-undecoded-capture` | Dynamic payload was captured but remains encrypted | Only transport occurrence and ciphertext are known; mark `encrypted: true, decoded: false` |
| `real-account-validated` | An explicitly authorized minimal request succeeded and refreshed state advanced | The action worked for that account and state at the validation time |

Resource names, Prefab labels, UI text, old local proto fields, and similarity to another activity are supporting clues, not schema evidence. Clearly label conclusions derived by combining sources as inferences.
