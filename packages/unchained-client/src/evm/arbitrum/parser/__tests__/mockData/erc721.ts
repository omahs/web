import type { Tx } from '../../../index'
import { mempoolMock } from './mempoolMock'

const erc721: Tx = {
  txid: '0x4a03a3ef8b599305b5af6481461be4dc7f35db37d07e1a21446f9d87613118e4',
  blockHash: '0x7f9974548f14110951b3102b99b8cce7eb753966803d1f55ccb2bd67d63b0d37',
  blockHeight: 136792108,
  timestamp: 1696255667,
  status: 1,
  from: '0xb92B9e394150781c282B6137695290a4C596DbB2',
  to: '0x1E3E1ed17A8Df57C215b45f00c2eC4717B33a93D',
  confirmations: 32986,
  value: '0',
  fee: '88558600000000',
  gasLimit: '1061669',
  gasUsed: '885586',
  gasPrice: '100000000',
  inputData:
    '0xb88d4fde000000000000000000000000b92b9e394150781c282b6137695290a4c596dbb2000000000000000000000000f5131c59194f11d9248a8e14c32d5b6f234542f600000000000000000000000000000000000000000000000000000000000fc26a000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000031bced02db0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000fc26a0000000000000000000000000000000000000000000000000000000000000001',
  tokenTransfers: [
    {
      contract: '0x1E3E1ed17A8Df57C215b45f00c2eC4717B33a93D',
      decimals: 18,
      name: 'DragonMO Token',
      symbol: 'DMO',
      type: 'ERC721',
      from: '0xb92B9e394150781c282B6137695290a4C596DbB2',
      to: '0xf5131C59194F11D9248A8e14c32D5b6f234542f6',
      value: '1',
      id: '1032810',
    },
  ],
  internalTxs: [],
}

export default {
  tx: erc721,
  txMempool: mempoolMock(erc721),
}
