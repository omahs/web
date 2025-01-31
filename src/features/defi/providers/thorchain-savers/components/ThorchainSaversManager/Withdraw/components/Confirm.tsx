import { Alert, AlertIcon, Box, Skeleton, Stack, useToast } from '@chakra-ui/react'
import { AddressZero } from '@ethersproject/constants'
import type { AccountId } from '@shapeshiftoss/caip'
import { bchChainId, fromAccountId, fromAssetId, toAssetId } from '@shapeshiftoss/caip'
import { FeeDataKey } from '@shapeshiftoss/chain-adapters'
import type { BuildCustomTxInput } from '@shapeshiftoss/chain-adapters/src/evm/types'
import { supportsETH } from '@shapeshiftoss/hdwallet-core'
import { getConfig } from 'config'
import { getOrCreateContractByType } from 'contracts/contractManager'
import { ContractType } from 'contracts/types'
import dayjs from 'dayjs'
import { Confirm as ReusableConfirm } from 'features/defi/components/Confirm/Confirm'
import { Summary } from 'features/defi/components/Summary'
import type {
  DefiParams,
  DefiQueryParams,
} from 'features/defi/contexts/DefiManagerProvider/DefiCommon'
import { DefiStep } from 'features/defi/contexts/DefiManagerProvider/DefiCommon'
import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslate } from 'react-polyglot'
import { Amount } from 'components/Amount/Amount'
import { AssetIcon } from 'components/AssetIcon'
import type { StepComponentProps } from 'components/DeFi/components/Steps'
import { HelperTooltip } from 'components/HelperTooltip/HelperTooltip'
import type { SendInput } from 'components/Modals/Send/Form'
import type { EstimateFeesInput } from 'components/Modals/Send/utils'
import { estimateFees, handleSend } from 'components/Modals/Send/utils'
import { Row } from 'components/Row/Row'
import { RawText, Text } from 'components/Text'
import { getChainAdapterManager } from 'context/PluginProvider/chainAdapterSingleton'
import { useBrowserRouter } from 'hooks/useBrowserRouter/useBrowserRouter'
import { useWallet } from 'hooks/useWallet/useWallet'
import { BigNumber, bn, bnOrZero } from 'lib/bignumber/bignumber'
import { fromBaseUnit, toBaseUnit } from 'lib/math'
import { trackOpportunityEvent } from 'lib/mixpanel/helpers'
import { getMixPanel } from 'lib/mixpanel/mixPanelSingleton'
import { MixPanelEvents } from 'lib/mixpanel/types'
import { getInboundAddressDataForChain } from 'lib/swapper/swappers/ThorchainSwapper/utils/getInboundAddressDataForChain'
import { SwapperName } from 'lib/swapper/types'
import { isToken } from 'lib/utils'
import {
  assertGetEvmChainAdapter,
  buildAndBroadcast,
  createBuildCustomTxInput,
} from 'lib/utils/evm'
import { getIsTradingActiveApi } from 'state/apis/swapper/getIsTradingActiveApi'
import {
  BASE_BPS_POINTS,
  fromThorBaseUnit,
  getThorchainSaversPosition,
  getThorchainSaversWithdrawQuote,
  getWithdrawBps,
  THORCHAIN_SAVERS_DUST_THRESHOLDS,
  toThorBaseUnit,
} from 'state/slices/opportunitiesSlice/resolvers/thorchainsavers/utils'
import { serializeUserStakingId, toOpportunityId } from 'state/slices/opportunitiesSlice/utils'
import { isUtxoChainId } from 'state/slices/portfolioSlice/utils'
import {
  selectAccountNumberByAccountId,
  selectAssetById,
  selectAssets,
  selectBIP44ParamsByAccountId,
  selectEarnUserStakingOpportunityByUserStakingId,
  selectFeeAssetById,
  selectHighestBalanceAccountIdByStakingId,
  selectMarketDataById,
  selectPortfolioCryptoBalanceBaseUnitByFilter,
  selectSelectedCurrency,
} from 'state/slices/selectors'
import { useAppDispatch, useAppSelector } from 'state/store'

import { ThorchainSaversWithdrawActionType } from '../WithdrawCommon'
import { WithdrawContext } from '../WithdrawContext'

type ConfirmProps = { accountId: AccountId | undefined } & StepComponentProps

export const Confirm: React.FC<ConfirmProps> = ({ accountId, onNext }) => {
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [expiry, setExpiry] = useState<string>('')
  const [maybeFromUTXOAccountAddress, setMaybeFromUTXOAccountAddress] = useState<string>('')
  const [protocolFeeCryptoBaseUnit, setProtocolFeeCryptoBaseUnit] = useState<string>('')
  const [networkFeeCryptoBaseUnit, setNetworkFeeCryptoBaseUnit] = useState<string>('')
  const [dustAmountCryptoBaseUnit, setDustAmountCryptoBaseUnit] = useState<string>('')
  const [slippageCryptoAmountPrecision, setSlippageCryptoAmountPrecision] = useState<string | null>(
    null,
  )
  const { state, dispatch: contextDispatch } = useContext(WithdrawContext)
  const appDispatch = useAppDispatch()
  const translate = useTranslate()
  const mixpanel = getMixPanel()
  const { query } = useBrowserRouter<DefiQueryParams, DefiParams>()
  const { chainId, assetNamespace, assetReference } = query
  const opportunity = state?.opportunity
  const chainAdapter = getChainAdapterManager().get(chainId)
  const assets = useAppSelector(selectAssets)

  // Asset info
  const assetId = toAssetId({
    chainId,
    assetNamespace,
    assetReference,
  })

  const opportunityId = useMemo(
    () => toOpportunityId({ chainId, assetNamespace, assetReference }),
    [assetNamespace, assetReference, chainId],
  )
  const highestBalanceAccountIdFilter = useMemo(
    () => ({ stakingId: opportunityId }),
    [opportunityId],
  )

  const highestBalanceAccountId = useAppSelector(state =>
    selectHighestBalanceAccountIdByStakingId(state, highestBalanceAccountIdFilter),
  )
  const opportunityDataFilter = useMemo(
    () => ({
      userStakingId: serializeUserStakingId(
        (accountId ?? highestBalanceAccountId)!,
        toOpportunityId({
          chainId,
          assetNamespace,
          assetReference,
        }),
      ),
    }),
    [accountId, assetNamespace, assetReference, chainId, highestBalanceAccountId],
  )

  const opportunityData = useAppSelector(state =>
    selectEarnUserStakingOpportunityByUserStakingId(state, opportunityDataFilter),
  )

  const asset = useAppSelector(state => selectAssetById(state, assetId ?? ''))
  const feeAsset = useAppSelector(state => selectFeeAssetById(state, assetId))
  const marketData = useAppSelector(state => selectMarketDataById(state, assetId ?? ''))
  const feeMarketData = useAppSelector(state =>
    selectMarketDataById(state, feeAsset?.assetId ?? ''),
  )

  const accountFilter = useMemo(() => ({ accountId }), [accountId])
  const bip44Params = useAppSelector(state => selectBIP44ParamsByAccountId(state, accountFilter))
  const userAddress: string | undefined = accountId && fromAccountId(accountId).account

  const accountNumberFilter = useMemo(() => ({ accountId }), [accountId])
  const accountNumber = useAppSelector(state =>
    selectAccountNumberByAccountId(state, accountNumberFilter),
  )

  if (!asset) throw new Error(`Asset not found for AssetId ${opportunityData?.assetId}`)
  if (!feeAsset) throw new Error(`Fee asset not found for AssetId ${assetId}`)

  const isTokenWithdraw = isToken(fromAssetId(assetId).assetReference)

  // user info
  const {
    state: { wallet },
  } = useWallet()

  const assetBalanceFilter = useMemo(
    () => ({ assetId: asset?.assetId, accountId: accountId ?? '' }),
    [accountId, asset?.assetId],
  )
  const assetBalanceBaseUnit = useAppSelector(s =>
    selectPortfolioCryptoBalanceBaseUnitByFilter(s, assetBalanceFilter),
  )

  const feeAssetBalanceFilter = useMemo(
    () => ({ assetId: feeAsset?.assetId, accountId }),
    [accountId, feeAsset?.assetId],
  )
  //
  const feeAssetBalanceCryptoBaseUnit = useAppSelector(s =>
    selectPortfolioCryptoBalanceBaseUnitByFilter(s, feeAssetBalanceFilter),
  )

  const selectedCurrency = useAppSelector(selectSelectedCurrency)

  // notify
  const toast = useToast()

  useEffect(() => {
    ;(async () => {
      try {
        if (!(accountId && opportunityData?.stakedAmountCryptoBaseUnit && asset)) return
        if (dustAmountCryptoBaseUnit && protocolFeeCryptoBaseUnit) return
        setQuoteLoading(true)

        const amountCryptoBaseUnit = toBaseUnit(state?.withdraw.cryptoAmount, asset.precision)
        if (bn(amountCryptoBaseUnit).isZero()) return

        const amountCryptoThorBaseUnit = toThorBaseUnit({
          valueCryptoBaseUnit: amountCryptoBaseUnit,
          asset,
        })

        const withdrawBps = getWithdrawBps({
          withdrawAmountCryptoBaseUnit: amountCryptoBaseUnit,
          stakedAmountCryptoBaseUnit: opportunityData.stakedAmountCryptoBaseUnit,
          rewardsAmountCryptoBaseUnit: opportunityData?.rewardsCryptoBaseUnit?.amounts[0] ?? '0',
        })

        if (bn(withdrawBps).isZero()) return

        const maybeQuote = await getThorchainSaversWithdrawQuote({
          asset,
          accountId,
          bps: withdrawBps,
        })

        if (maybeQuote.isErr()) throw new Error(maybeQuote.unwrapErr())

        const { expiry, dust_amount, expected_amount_out, slippage_bps } = maybeQuote.unwrap()

        setExpiry(expiry)

        setProtocolFeeCryptoBaseUnit(
          toBaseUnit(
            fromThorBaseUnit(amountCryptoThorBaseUnit.minus(expected_amount_out)),
            asset.precision,
          ),
        )
        setDustAmountCryptoBaseUnit(
          bnOrZero(toBaseUnit(fromThorBaseUnit(dust_amount), asset.precision)).toFixed(
            asset.precision,
          ),
        )
        const percentage = bnOrZero(slippage_bps).div(BASE_BPS_POINTS).times(100)
        // total downside (slippage going into position) - 0.007 ETH for 5 ETH deposit
        const cryptoSlippageAmountPrecision = bnOrZero(state?.withdraw.cryptoAmount)
          .times(percentage)
          .div(100)
        setSlippageCryptoAmountPrecision(cryptoSlippageAmountPrecision.toString())
      } catch (e) {
        console.error(e)
      } finally {
        setQuoteLoading(false)
      }
    })()
  }, [
    accountId,
    asset,
    dustAmountCryptoBaseUnit,
    opportunity?.apy,
    opportunityData?.rewardsCryptoBaseUnit,
    opportunityData?.stakedAmountCryptoBaseUnit,
    state?.withdraw.cryptoAmount,
    protocolFeeCryptoBaseUnit,
  ])

  useEffect(() => {
    ;(async () => {
      if (maybeFromUTXOAccountAddress || !isUtxoChainId(chainId) || !accountId) return

      try {
        const position = await getThorchainSaversPosition({ accountId, assetId })
        if (!position) return ''
        const { asset_address } = position
        const accountAddress =
          chainId === bchChainId ? `bitcoincash:${asset_address}` : asset_address

        setMaybeFromUTXOAccountAddress(accountAddress)
      } catch (_e) {
        throw new Error(`Cannot get savers position for accountId: ${accountId}`)
      }
    })()
  }, [accountId, assetId, chainId, maybeFromUTXOAccountAddress])

  const getEstimateFeesArgs: () => Promise<EstimateFeesInput | undefined> =
    useCallback(async () => {
      if (isTokenWithdraw) return
      if (!(accountId && opportunityData?.stakedAmountCryptoBaseUnit?.[0]))
        throw new Error('accountId is undefined')

      if (bnOrZero(state?.withdraw.cryptoAmount).isZero()) return

      const amountCryptoBaseUnit = toBaseUnit(state?.withdraw.cryptoAmount, asset.precision)

      const withdrawBps = getWithdrawBps({
        withdrawAmountCryptoBaseUnit: amountCryptoBaseUnit,
        stakedAmountCryptoBaseUnit: opportunityData?.stakedAmountCryptoBaseUnit,
        rewardsAmountCryptoBaseUnit: opportunityData?.rewardsCryptoBaseUnit?.amounts[0] ?? '0',
      })
      const maybeQuote = await getThorchainSaversWithdrawQuote({
        asset,
        accountId,
        bps: withdrawBps,
      })

      if (isUtxoChainId(chainId) && !maybeFromUTXOAccountAddress) {
        throw new Error('Account address required to withdraw from THORChain savers')
      }

      if (maybeQuote.isErr()) throw new Error(maybeQuote.unwrapErr())
      const quote = maybeQuote.unwrap()
      const { expiry, expected_amount_out, dust_amount } = quote

      const amountCryptoThorBaseUnit = toThorBaseUnit({
        valueCryptoBaseUnit: amountCryptoBaseUnit,
        asset,
      })
      setExpiry(expiry)
      setProtocolFeeCryptoBaseUnit(
        toBaseUnit(
          fromThorBaseUnit(amountCryptoThorBaseUnit.minus(expected_amount_out)),
          asset.precision,
        ),
      )

      if (!maybeQuote) throw new Error('Cannot get THORCHain savers withdraw quote')

      return {
        from: maybeFromUTXOAccountAddress,
        cryptoAmount: fromThorBaseUnit(dust_amount).toFixed(asset.precision),
        assetId,
        to: quote.inbound_address,
        sendMax: false,
        accountId,
        contractAddress: '',
      }
    }, [
      accountId,
      asset,
      assetId,
      chainId,
      isTokenWithdraw,
      maybeFromUTXOAccountAddress,
      opportunityData?.rewardsCryptoBaseUnit?.amounts,
      opportunityData?.stakedAmountCryptoBaseUnit,
      state?.withdraw.cryptoAmount,
    ])

  const getCustomTxInput: () => Promise<BuildCustomTxInput | undefined> = useCallback(async () => {
    if (!contextDispatch || !opportunityData?.stakedAmountCryptoBaseUnit) return
    if (!(accountId && assetId && feeAsset && accountNumber !== undefined && wallet)) return
    if (!state?.withdraw.cryptoAmount) {
      throw new Error('Cannot send 0-value THORCHain savers Tx')
    }

    try {
      const adapter = assertGetEvmChainAdapter(chainId)

      const amountCryptoBaseUnit = toBaseUnit(state?.withdraw.cryptoAmount, asset.precision)
      const withdrawBps = getWithdrawBps({
        withdrawAmountCryptoBaseUnit: amountCryptoBaseUnit,
        stakedAmountCryptoBaseUnit: opportunityData.stakedAmountCryptoBaseUnit,
        rewardsAmountCryptoBaseUnit: opportunityData.rewardsCryptoBaseUnit?.amounts[0] ?? '0',
      })

      if (bn(withdrawBps).isZero()) return
      const maybeQuote = await getThorchainSaversWithdrawQuote({
        asset,
        accountId,
        bps: withdrawBps,
      })

      if (maybeQuote.isErr()) throw new Error(maybeQuote.unwrapErr())

      const quote = maybeQuote.unwrap()

      const daemonUrl = getConfig().REACT_APP_THORCHAIN_NODE_URL
      const maybeInboundAddressData = await getInboundAddressDataForChain(
        daemonUrl,
        feeAsset?.assetId,
      )
      if (maybeInboundAddressData.isErr())
        throw new Error(maybeInboundAddressData.unwrapErr().message)
      const inboundAddressData = maybeInboundAddressData.unwrap()
      // Guaranteed to be defined for EVM chains, and approve are only for EVM chains
      const router = inboundAddressData.router!

      const thorContract = getOrCreateContractByType({
        address: router,
        type: ContractType.ThorRouter,
        chainId: asset.chainId,
      })

      // i.e 10 Gwei for EVM chains
      // This function call is super dumb, and the param we pass as `amount` isn't actually the amount we intend to withdraw
      // In addition to being used as the `memo` positional param, it is also the value of ETH to be sent with the Tx to actually trigger a withdraw
      const amount = THORCHAIN_SAVERS_DUST_THRESHOLDS[feeAsset.assetId]

      const data = thorContract.interface.encodeFunctionData('depositWithExpiry', [
        quote.inbound_address,
        // This looks incorrect according to https://dev.thorchain.org/thorchain-dev/concepts/sending-transactions#evm-chains
        // But this is how THORSwap does it, and it actually works - using the actual asset address as "asset" will result in reverts
        AddressZero,
        amount,
        quote.memo,
        quote.expiry,
      ])

      const buildCustomTxInput = await createBuildCustomTxInput({
        accountNumber,
        adapter,
        data,
        value: amount,
        to: router,
        wallet,
      })

      return buildCustomTxInput
    } catch (e) {
      console.error(e)
    }
  }, [
    contextDispatch,
    opportunityData?.stakedAmountCryptoBaseUnit,
    opportunityData?.rewardsCryptoBaseUnit?.amounts,
    accountId,
    assetId,
    feeAsset,
    accountNumber,
    wallet,
    state?.withdraw.cryptoAmount,
    chainId,
    asset,
  ])

  const getCustomTxFees = useCallback(async () => {
    if (!isTokenWithdraw) return
    if (!wallet || !accountId) return

    const adapter = assertGetEvmChainAdapter(chainId)
    const customTxInput = await getCustomTxInput()
    if (!customTxInput) return undefined

    const fees = await adapter.getFeeData({
      to: customTxInput.to,
      value: customTxInput.value,
      chainSpecific: {
        from: fromAccountId(accountId).account,
        data: customTxInput.data,
      },
    })

    return fees
  }, [accountId, chainId, getCustomTxInput, isTokenWithdraw, wallet])

  useEffect(() => {
    ;(async () => {
      if (!contextDispatch) return
      const estimatedFees = await (async () => {
        if (isTokenWithdraw) return getCustomTxFees()
        const estimateFeeArgs = await getEstimateFeesArgs()
        return estimateFees(estimateFeeArgs!)
      })()

      if (!estimatedFees) return

      setNetworkFeeCryptoBaseUnit(estimatedFees.fast.txFee)

      contextDispatch({
        type: ThorchainSaversWithdrawActionType.SET_WITHDRAW,
        payload: {
          networkFeeCryptoBaseUnit: estimatedFees.fast.txFee,
        },
      })
    })()
  }, [contextDispatch, getCustomTxFees, getEstimateFeesArgs, isTokenWithdraw])

  const getPreWithdrawInput: () => Promise<SendInput | undefined> = useCallback(async () => {
    if (
      !(
        accountId &&
        assetId &&
        state?.withdraw?.estimatedGasCryptoBaseUnit &&
        opportunityData?.stakedAmountCryptoBaseUnit &&
        contextDispatch
      )
    )
      return

    try {
      const estimateFeesArgs = await getEstimateFeesArgs()
      if (!estimateFeesArgs) return
      const estimatedFees = await estimateFees(estimateFeesArgs)

      contextDispatch({
        type: ThorchainSaversWithdrawActionType.SET_WITHDRAW,
        payload: {
          networkFeeCryptoBaseUnit: estimatedFees.fast.txFee,
        },
      })

      const amountCryptoBaseUnit = toBaseUnit(state?.withdraw.cryptoAmount, asset.precision)
      const bps = getWithdrawBps({
        withdrawAmountCryptoBaseUnit: amountCryptoBaseUnit,
        stakedAmountCryptoBaseUnit: opportunityData?.stakedAmountCryptoBaseUnit,
        rewardsAmountCryptoBaseUnit: opportunityData?.rewardsCryptoBaseUnit?.amounts[0] ?? '0',
      })

      const maybeQuote = await getThorchainSaversWithdrawQuote({ asset, accountId, bps })

      if (maybeQuote.isErr()) throw new Error(maybeQuote.unwrapErr())
      const quote = maybeQuote.unwrap()

      if (isUtxoChainId(chainId) && !maybeFromUTXOAccountAddress) {
        throw new Error('Account address required to withdraw from THORChain savers')
      }

      const sendInput: SendInput = {
        cryptoAmount: '',
        assetId,
        from: '', // Let coinselect do its magic here
        to: maybeFromUTXOAccountAddress,
        sendMax: true,
        accountId,
        amountFieldError: '',
        estimatedFees,
        feeType: FeeDataKey.Fast,
        fiatAmount: '',
        fiatSymbol: selectedCurrency,
        vanityAddress: '',
        input: quote.inbound_address,
      }

      return sendInput
    } catch (e) {
      console.error(e)
    }
  }, [
    accountId,
    assetId,
    state?.withdraw?.estimatedGasCryptoBaseUnit,
    state?.withdraw.cryptoAmount,
    opportunityData?.stakedAmountCryptoBaseUnit,
    opportunityData?.rewardsCryptoBaseUnit?.amounts,
    contextDispatch,
    getEstimateFeesArgs,
    asset,
    chainId,
    maybeFromUTXOAccountAddress,
    selectedCurrency,
  ])

  const getWithdrawInput: () => Promise<SendInput | undefined> = useCallback(async () => {
    if (!(accountId && assetId && opportunityData?.stakedAmountCryptoBaseUnit && contextDispatch))
      return

    try {
      const estimateFeesArgs = await getEstimateFeesArgs()
      if (!estimateFeesArgs) return
      const estimatedFees = await estimateFees(estimateFeesArgs)

      contextDispatch({
        type: ThorchainSaversWithdrawActionType.SET_WITHDRAW,
        payload: {
          networkFeeCryptoBaseUnit: estimatedFees.fast.txFee,
        },
      })

      const amountCryptoBaseUnit = toBaseUnit(state?.withdraw.cryptoAmount, asset.precision)
      const withdrawBps = getWithdrawBps({
        withdrawAmountCryptoBaseUnit: amountCryptoBaseUnit,
        stakedAmountCryptoBaseUnit: opportunityData?.stakedAmountCryptoBaseUnit,
        rewardsAmountCryptoBaseUnit: opportunityData?.rewardsCryptoBaseUnit?.amounts[0] ?? '0',
      })

      if (bn(withdrawBps).isZero()) return

      const maybeQuote = await getThorchainSaversWithdrawQuote({
        asset,
        accountId,
        bps: withdrawBps,
      })

      if (maybeQuote.isErr()) throw new Error(maybeQuote.unwrapErr())
      const quote = maybeQuote.unwrap()

      const { dust_amount } = quote

      if (isUtxoChainId(chainId) && !maybeFromUTXOAccountAddress) {
        throw new Error('Account address required to withdraw from THORChain savers')
      }

      const sendInput: SendInput = {
        cryptoAmount: fromThorBaseUnit(dust_amount).toFixed(asset.precision),
        assetId,
        to: quote.inbound_address,
        from: maybeFromUTXOAccountAddress,
        sendMax: false,
        accountId,
        amountFieldError: '',
        estimatedFees,
        feeType: FeeDataKey.Fast,
        fiatAmount: '',
        fiatSymbol: selectedCurrency,
        vanityAddress: '',
        input: quote.inbound_address,
      }

      return sendInput
    } catch (e) {
      console.error(e)
    }
  }, [
    accountId,
    assetId,
    opportunityData?.stakedAmountCryptoBaseUnit,
    opportunityData?.rewardsCryptoBaseUnit?.amounts,
    getEstimateFeesArgs,
    contextDispatch,
    state?.withdraw.cryptoAmount,
    asset,
    chainId,
    maybeFromUTXOAccountAddress,
    selectedCurrency,
  ])

  const handleCustomTx = useCallback(async (): Promise<string | undefined> => {
    if (!wallet) return
    const buildCustomTxInput = await getCustomTxInput()
    if (!buildCustomTxInput) return

    const adapter = assertGetEvmChainAdapter(chainId)

    const txid = await buildAndBroadcast({ adapter, buildCustomTxInput })
    return txid
  }, [wallet, getCustomTxInput, chainId])

  const handleMultiTxSend = useCallback(async (): Promise<string | undefined> => {
    if (!wallet) return

    // THORChain Txs need to always be sent from the same address, since the address (NOT the pubkey) is used to identify an active position
    // The way THORChain does this is by not being xpub-compliant, and only exposing a single address for UTXOs in their UI
    // All deposit/withdraws done from their UI are always done with one/many UTXOs from the same address, and change sent back to the same address
    // We also do this EXCLUSIVELY for THORChain Txs. The rest of the app uses xpubs, so the initially deposited from address isn't guaranteed to be populated
    // if users send other UTXO Txs in the meantime after depositing
    // Additionally, we select their highest balance UTXO address as a first deposit, which isn't guaranteed to contain enough value
    //
    // For both re/deposit flows, we will possibly need a pre-Tx to populate their highest UTXO/previously deposited from address with enough value

    const withdrawInput = await getWithdrawInput()
    if (!withdrawInput) throw new Error('Error building send input')

    // Try/catching and evaluating to something in the catch isn't a good pattern usually
    // In our case, handleSend() catching means that after all our previous checks, building a Tx failed at coinselect time
    // So we actually send reconciliate a reconciliate Tx, retry the original send within the same block
    // and finally evaluate to either the original Tx or a falsy empty string
    // 1. Try to deposit from the originally deposited from / highest UTXO balance address
    // If this is enough, no other Tx is needed
    const txId = await handleSend({
      sendInput: withdrawInput,
      wallet,
    }).catch(async e => {
      if (!isUtxoChainId(chainId)) throw e

      // 2. coinselect threw when building a Tx, meaning there's not enough value in the picked address - send funds to it
      const preWithdrawInput = await getPreWithdrawInput()
      if (!preWithdrawInput) throw new Error('Error building send input')

      return handleSend({
        sendInput: preWithdrawInput,
        wallet: wallet!,
      }).then(async () => {
        // Safety factor for the Tx to be seen in the mempool
        await new Promise(resolve => setTimeout(resolve, 5000))
        // 3. Sign and broadcast the depooosit Tx again
        return handleSend({
          sendInput: withdrawInput,
          wallet: wallet!,
        })
      })
    })

    return txId
  }, [chainId, getPreWithdrawInput, getWithdrawInput, wallet])

  const handleConfirm = useCallback(async () => {
    if (!contextDispatch || !bip44Params || !accountId || !assetId || !opportunityData) return
    try {
      if (
        !(
          userAddress &&
          assetReference &&
          wallet &&
          supportsETH(wallet) &&
          opportunity &&
          chainAdapter
        )
      )
        return

      if (isUtxoChainId(chainId) && !maybeFromUTXOAccountAddress) return

      contextDispatch({ type: ThorchainSaversWithdrawActionType.SET_LOADING, payload: true })
      if (!state?.withdraw.cryptoAmount) return

      if (dayjs().isAfter(dayjs.unix(Number(expiry)))) {
        toast({
          position: 'top-right',
          description: translate('trade.errors.quoteExpired'),
          title: translate('common.transactionFailed'),
          status: 'error',
        })
        onNext(DefiStep.Info)
        return
      }

      const { getIsTradingActive } = getIsTradingActiveApi.endpoints
      const { data: isTradingActive } = await appDispatch(
        getIsTradingActive.initiate({
          assetId,
          swapperName: SwapperName.Thorchain,
        }),
      )

      if (!isTradingActive) {
        throw new Error(`THORChain pool halted for assetId: ${assetId}`)
      }

      const maybeTxId = await (async () => {
        if (isTokenWithdraw) {
          return handleCustomTx()
        }

        const withdrawInput = await getWithdrawInput()
        if (!withdrawInput) throw new Error('Error building send input')
        return handleMultiTxSend()
      })()

      if (!maybeTxId) {
        throw new Error('Error sending THORCHain savers Txs')
      }

      if (!maybeTxId) {
        throw new Error('Error sending THORCHain savers Txs')
      }

      contextDispatch({ type: ThorchainSaversWithdrawActionType.SET_TXID, payload: maybeTxId })
      contextDispatch({
        type: ThorchainSaversWithdrawActionType.SET_WITHDRAW,
        payload: {
          dustAmountCryptoBaseUnit,
          protocolFeeCryptoBaseUnit,
          maybeFromUTXOAccountAddress,
        },
      })
      onNext(DefiStep.Status)
      trackOpportunityEvent(
        MixPanelEvents.WithdrawConfirm,
        {
          opportunity: opportunityData,
          fiatAmounts: [state.withdraw.fiatAmount],
          cryptoAmounts: [{ assetId, amountCryptoHuman: state.withdraw.cryptoAmount }],
        },
        assets,
      )
    } catch (error) {
      console.error(error)
      toast({
        position: 'top-right',
        description: translate('common.transactionFailedBody'),
        title: translate('common.transactionFailed'),
        status: 'error',
      })
    } finally {
      contextDispatch({ type: ThorchainSaversWithdrawActionType.SET_LOADING, payload: false })
    }
  }, [
    contextDispatch,
    bip44Params,
    accountId,
    assetId,
    opportunityData,
    userAddress,
    assetReference,
    wallet,
    opportunity,
    chainAdapter,
    chainId,
    maybeFromUTXOAccountAddress,
    state?.withdraw.cryptoAmount,
    state?.withdraw.fiatAmount,
    expiry,
    appDispatch,
    getWithdrawInput,
    dustAmountCryptoBaseUnit,
    protocolFeeCryptoBaseUnit,
    onNext,
    assets,
    toast,
    translate,
    isTokenWithdraw,
    handleMultiTxSend,
    handleCustomTx,
  ])

  const handleCancel = useCallback(() => {
    onNext(DefiStep.Info)
  }, [onNext])

  const missingBalanceForGasCryptoPrecision = useMemo(() => {
    // Token withdraws aren't dust sends, they're actual contract calls
    // Hence, the balance required for them is denominated in the native fee asset
    if (isTokenWithdraw) {
      return fromBaseUnit(
        bnOrZero(feeAssetBalanceCryptoBaseUnit)
          .minus(bnOrZero(state?.withdraw.estimatedGasCryptoBaseUnit))
          .times(-1),
        feeAsset.precision,
      )
    }
    return fromBaseUnit(
      bnOrZero(assetBalanceBaseUnit)
        .minus(bnOrZero(state?.withdraw.estimatedGasCryptoBaseUnit))
        .minus(bnOrZero(dustAmountCryptoBaseUnit))
        .times(-1),
      feeAsset.precision,
    )
  }, [
    isTokenWithdraw,
    assetBalanceBaseUnit,
    state?.withdraw.estimatedGasCryptoBaseUnit,
    dustAmountCryptoBaseUnit,
    feeAssetBalanceCryptoBaseUnit,
    feeAsset.precision,
  ])

  const hasEnoughBalanceForGas = useMemo(
    () => bn(missingBalanceForGasCryptoPrecision).lte(0),
    [missingBalanceForGasCryptoPrecision],
  )

  useEffect(() => {
    if (!hasEnoughBalanceForGas) {
      mixpanel?.track(MixPanelEvents.InsufficientFunds)
    }
  }, [hasEnoughBalanceForGas, mixpanel])

  if (!state || !contextDispatch) return null

  return (
    <ReusableConfirm
      onCancel={handleCancel}
      headerText='modals.confirm.withdraw.header'
      isDisabled={!hasEnoughBalanceForGas}
      loading={quoteLoading || state.loading}
      loadingText={translate('common.confirm')}
      onConfirm={handleConfirm}
    >
      <Summary>
        <Row variant='vertical' p={4}>
          <Row.Label>
            <Text translation='modals.confirm.amountToWithdraw' />
          </Row.Label>
          <Row px={0} fontWeight='medium'>
            <Stack direction='row' alignItems='center'>
              <AssetIcon size='xs' src={asset.icon} />
              <RawText>{asset.name}</RawText>
            </Stack>
            <Row.Value>
              <Amount.Crypto value={state.withdraw.cryptoAmount} symbol={asset.symbol} />
            </Row.Value>
          </Row>
        </Row>
        <Row variant='gutter'>
          <Row.Label>{translate('common.slippage')}</Row.Label>
          <Row.Value>
            <Amount.Crypto value={slippageCryptoAmountPrecision ?? ''} symbol={asset.symbol} />
          </Row.Value>
        </Row>
        <Row variant='gutter'>
          <Row.Label>
            <HelperTooltip label={translate('trade.tooltip.protocolFee')}>
              <Text translation='trade.protocolFee' />
            </HelperTooltip>
          </Row.Label>
          <Row.Value>
            <Box textAlign='right'>
              <Skeleton isLoaded={!quoteLoading}>
                <Amount.Fiat
                  fontWeight='bold'
                  value={bnOrZero(protocolFeeCryptoBaseUnit)
                    .div(bn(10).pow(asset.precision))
                    .times(marketData.price)
                    .toFixed()}
                />
                <Amount.Crypto
                  color='text.subtle'
                  value={bnOrZero(protocolFeeCryptoBaseUnit)
                    .div(bn(10).pow(asset.precision))
                    .toFixed()}
                  symbol={asset.symbol}
                />
              </Skeleton>
            </Box>
          </Row.Value>
        </Row>
        <Row variant='gutter'>
          <Row.Label>
            <HelperTooltip label={translate('trade.tooltip.minerFee')}>
              <Text translation='trade.minerFee' />
            </HelperTooltip>
          </Row.Label>
          <Row.Value>
            <Box textAlign='right'>
              <Skeleton isLoaded={!quoteLoading}>
                <Amount.Fiat
                  fontWeight='bold'
                  value={bnOrZero(networkFeeCryptoBaseUnit)
                    .div(bn(10).pow(feeAsset.precision))
                    .times(feeMarketData.price)
                    .toFixed()}
                />
                <Amount.Crypto
                  color='text.subtle'
                  value={bnOrZero(networkFeeCryptoBaseUnit)
                    .div(bn(10).pow(feeAsset.precision))
                    .toFixed()}
                  symbol={feeAsset.symbol}
                />
              </Skeleton>
            </Box>
          </Row.Value>
        </Row>
        {!isTokenWithdraw && (
          <Row variant='gutter'>
            <Row.Label>
              <HelperTooltip label={translate('defi.modals.saversVaults.dustAmountTooltip')}>
                <Text translation='defi.modals.saversVaults.dustAmount' />
              </HelperTooltip>
            </Row.Label>
            <Row.Value>
              <Box textAlign='right'>
                <Skeleton isLoaded={!quoteLoading}>
                  <Amount.Fiat
                    fontWeight='bold'
                    value={bnOrZero(dustAmountCryptoBaseUnit)
                      .div(bn(10).pow(asset.precision))
                      .times(marketData.price)
                      .toFixed(2)}
                  />
                  <Amount.Crypto
                    color='text.subtle'
                    value={bnOrZero(dustAmountCryptoBaseUnit)
                      .div(bn(10).pow(asset.precision))
                      .toFixed()}
                    symbol={asset.symbol}
                  />
                </Skeleton>
              </Box>
            </Row.Value>
          </Row>
        )}
        {!hasEnoughBalanceForGas && (
          <Alert status='error' borderRadius='lg'>
            <AlertIcon />
            <Text
              translation={[
                'modals.confirm.missingFundsForGas',
                {
                  cryptoAmountHuman: bn(missingBalanceForGasCryptoPrecision).toFixed(
                    6,
                    BigNumber.ROUND_UP,
                  ),
                  assetSymbol: feeAsset.symbol,
                },
              ]}
            />
          </Alert>
        )}
      </Summary>
    </ReusableConfirm>
  )
}
