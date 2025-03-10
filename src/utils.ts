import { encodeBase64ToJson, encodeJsonToBase64 } from './base64.js';
import { MintKeys, Proof, Token, TokenEntry, TokenV2 } from './model/types/index.js';
import { TOKEN_PREFIX, TOKEN_VERSION } from './utils/Constants.js';
import { bytesToHex } from '@noble/curves/abstract/utils';
import { sha256 } from '@noble/hashes/sha256';
import { Buffer } from 'buffer/';

function splitAmount(value: number): Array<number> {
	const chunks: Array<number> = [];
	for (let i = 0; i < 32; i++) {
		const mask: number = 1 << i;
		if ((value & mask) !== 0) {
			chunks.push(Math.pow(2, i));
		}
	}
	return chunks;
}

function bytesToNumber(bytes: Uint8Array): bigint {
	return hexToNumber(bytesToHex(bytes));
}

function hexToNumber(hex: string): bigint {
	return BigInt(`0x${hex}`);
}

//used for json serialization
function bigIntStringify<T>(_key: unknown, value: T) {
	return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * Helper function to encode a v3 cashu token
 * @param token
 * @returns
 */
function getEncodedToken(token: Token): string {
	return TOKEN_PREFIX + TOKEN_VERSION + encodeJsonToBase64(token);
}

/**
 * Helper function to decode cashu tokens into object
 * @param token an encoded cashu token (cashuAey...)
 * @returns cashu token object
 */
function getDecodedToken(token: string): Token {
	// remove prefixes
	const uriPrefixes = ['web+cashu://', 'cashu://', 'cashu:', 'cashuA'];
	uriPrefixes.forEach((prefix) => {
		if (!token.startsWith(prefix)) {
			return;
		}
		token = token.slice(prefix.length);
	});
	return handleTokens(token);
}

/**
 * @param token
 * @returns
 */
function handleTokens(token: string): Token {
	const obj = encodeBase64ToJson<TokenV2 | Array<Proof> | Token>(token);

	// check if v3
	if ('token' in obj) {
		return obj;
	}

	// check if v1
	if (Array.isArray(obj)) {
		return { token: [{ proofs: obj, mint: '' }] };
	}

	// if v2 token return v3 format
	return { token: [{ proofs: obj.proofs, mint: obj?.mints[0]?.url ?? '' }] };
}
/**
 * Returns the keyset id of a set of keys
 * @param keys keys object to derive keyset id from
 * @returns
 */
export function deriveKeysetId(keys: MintKeys) {
	const pubkeysConcat = Object.entries(keys)
		.sort((a, b) => +a[0] - +b[0])
		.map(([, pubKey]) => pubKey)
		.join('');
	const hash = sha256(new TextEncoder().encode(pubkeysConcat));
	return Buffer.from(hash).toString('base64').slice(0, 12);
}
/**
 * merge proofs from same mint,
 * removes TokenEntrys with no proofs or no mint field
 * and sorts proofs by id
 *
 * @export
 * @param {Token} token
 * @return {*}  {Token}
 */
export function cleanToken(token: Token): Token {
	const tokenEntryMap: { [key: string]: TokenEntry } = {};
	for (const tokenEntry of token.token) {
		if (!tokenEntry?.proofs?.length || !tokenEntry?.mint) {
			continue;
		}
		if (tokenEntryMap[tokenEntry.mint]) {
			tokenEntryMap[tokenEntry.mint].proofs.push(...[...tokenEntry.proofs]);
			continue;
		}
		tokenEntryMap[tokenEntry.mint] = { mint: tokenEntry.mint, proofs: [...tokenEntry.proofs] };
	}
	return {
		memo: token?.memo,
		token: Object.values(tokenEntryMap).map((x) => ({ ...x, proofs: sortProofsById(x.proofs) }))
	};
}
export function sortProofsById(proofs: Array<Proof>) {
	return proofs.sort((a, b) => a.id.localeCompare(b.id));
}

export function isObj(v: unknown): v is object {
	return typeof v === 'object';
}

export function checkResponse(data: { error?: string; detail?: string }) {
	if (!isObj(data)) return;
	if ('error' in data && data.error) {
		throw new Error(data.error);
	}
	if ('detail' in data && data.detail) {
		throw new Error(data.detail);
	}
}

export function joinUrls(...parts: string[]): string {
	return parts.map((part) => part.replace(/(^\/+|\/+$)/g, '')).join('/');
}

export {
	hexToNumber,
	splitAmount,
	bytesToNumber,
	bigIntStringify,
	getDecodedToken,
	getEncodedToken
};
