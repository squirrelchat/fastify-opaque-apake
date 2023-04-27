/*!
 * Copyright (c) Squirrel Chat et al., All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *    may be used to endorse or promote products derived from this software without
 *    specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { readFile, writeFile } from 'fs/promises'
import { Server } from '@squirrelchat/opaque-wasm-server'

type State =
	| { state: Uint8Array | undefined }
	| { stateFile: string | URL }
	| {
		getState: () => Uint8Array | undefined | Promise<Uint8Array | undefined>,
		setState: (state: Uint8Array) => void | Promise<void>
	}

export type OpaqueApakeCorePluginOptions = State & {}

async function gracefulReadFile (file: string | URL) {
	try {
		return await readFile(file)
	} catch (e: any) {
		if (e.code === 'ENOENT') {
			// Gracefully return void
			return void 0
		}

		throw e
	}
}

async function opaqueApakeCorePlugin (fastify: FastifyInstance, opts: OpaqueApakeCorePluginOptions) {
	let state: Uint8Array | undefined

	if ('state' in opts) {
		state = opts.state
	} else if ('getState' in opts) {
		state = await opts.getState()
	} else if ('stateFile' in opts) {
		state = await gracefulReadFile(opts.stateFile)
	} else {
		throw new Error('No state was specified!')
	}

	const server = new Server(state)
	if (!state) {
		if ('setState' in opts) {
			await opts.setState(server.getState())
		} else if ('stateFile' in opts) {
			await writeFile(opts.stateFile, server.getState())
		}
	}

	fastify.decorate('opaque', server)
	fastify.addHook('onClose', () => {
		fastify.opaque.free()
	})
}

export default fp(opaqueApakeCorePlugin, {
	name: 'opaque-apake-core',
	fastify: '4.x',
})

// Extend Fastify interface
declare module 'fastify' {
	interface FastifyInstance {
		opaque: Server
	}
}
