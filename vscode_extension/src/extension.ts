import * as vscode from 'vscode'
import * as https from 'http'

async function fetch(prompt: string) {
	const data = JSON.stringify({ prompt: prompt })

	return new Promise<any>((resolve, reject) => {
		let respone_data = ''
		const req = https.request('http://localhost:5000/autocomplete', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': data.length
			}
		}, (res) => {
			res.on('data', (d) => {
				respone_data += d
			})

			res.on('end', () => {
				resolve(JSON.parse(respone_data))
			})
		})
		req.on('error', (error) => {
			console.error(error)
			reject()
		})
		req.write(data)
		req.end()
	})
}

function getPrompt(document: vscode.TextDocument, position: vscode.Position) {
	const start = Math.max(0, position.line - 20)
	let text = ''
	for (let i = start; i < position.line; ++i) {
		text += document.lineAt(i).text + '\n'
	}
	const line = document.lineAt(position).text
	text += line.substr(0, position.character)

	return text
}

function cleanupPredictions(predictions: string[]): string[] {
	let res = []
	for(let p of predictions) {
		let nl = p.indexOf('\n')
		if (nl !== -1) {
			p = p.substr(0, nl)
		}
		if(p !== '') {
			res.push(p)
		}
	}

	return res
}

function addPrefix(prefix: string, predictions: string[]): string[] {
	let res = []
	for(let p of predictions) {
		res.push(prefix + p)
	}

	return res
}

function hasNewLine(predictions: string[]): boolean[] {
	let res = []
	for(let p of predictions) {
		res.push(p.indexOf('\n') !== -1)
	}

	return res
}

function getCompletions(predictions: string[], nl: boolean[]): vscode.CompletionItem[] {
	let res = []
	for(let i = 0; i < predictions.length; ++i) {
			// Create a completion
			const simpleCompletion = new vscode.CompletionItem(predictions[i])
			simpleCompletion.kind = vscode.CompletionItemKind.Text
			// Dont trigger autocompletion if we hit a new line
			if (!nl[i]) {
				simpleCompletion.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' }
			}

			res.push(simpleCompletion)
	}

	return res
}

export function activate(context: vscode.ExtensionContext) {
	const provider = vscode.languages.registerCompletionItemProvider('python', {
		async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
			const prompt = getPrompt(document, position)
			let response

			try {
				response = await fetch(prompt)
			} catch(e) {
				return []
			}

			// Failure
			if (!response.success) {
				return []
			}

			let predictions: string[] = response.prediction
			const nl = hasNewLine(predictions)
			predictions = cleanupPredictions(predictions)

			if (predictions.length === 0) {
				// If at end of a line just predict new line, to avoid annoying default vscode predictions
				if (nl.length > 0 && nl[0]) {
					const simpleCompletion = new vscode.CompletionItem('\n')
					simpleCompletion.kind = vscode.CompletionItemKind.Text
					simpleCompletion.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions...' }
					return [simpleCompletion]
				}
				return []
			}

			// Add any word prefix from text (because thats how vscode works)
			let range = document.getWordRangeAtPosition(position)
			if (range != null) {
				const line = document.lineAt(position).text
				let prefix = line.substring(range.start.character, position.character)
				predictions = addPrefix(prefix, predictions)
			}

			return getCompletions(predictions, nl)
		}
	})

	context.subscriptions.push(provider)
}
