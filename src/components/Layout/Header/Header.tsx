import { HamburgerIcon, InfoIcon } from '@chakra-ui/icons'
import {
  Box,
  Drawer,
  DrawerContent,
  DrawerOverlay,
  Flex,
  HStack,
  IconButton,
  useDisclosure,
  usePrevious,
  useToast,
} from '@chakra-ui/react'
import { btcAssetId } from '@shapeshiftoss/caip'
import { MetaMaskShapeShiftMultiChainHDWallet } from '@shapeshiftoss/hdwallet-shapeshift-multichain'
import { useScroll } from 'framer-motion'
import { WalletConnectToDappsHeaderButton } from 'plugins/walletConnectToDapps/components/header/WalletConnectToDappsHeaderButton'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from 'react-polyglot'
import { useSelector } from 'react-redux'
import { useHistory } from 'react-router-dom'
import { Text } from 'components/Text'
import { WalletActions } from 'context/WalletProvider/actions'
import { useFeatureFlag } from 'hooks/useFeatureFlag/useFeatureFlag'
import { useIsSnapInstalled } from 'hooks/useIsSnapInstalled/useIsSnapInstalled'
import { useModal } from 'hooks/useModal/useModal'
import { useWallet } from 'hooks/useWallet/useWallet'
import { portfolio } from 'state/slices/portfolioSlice/portfolioSlice'
import { isUtxoAccountId } from 'state/slices/portfolioSlice/utils'
import {
  selectPortfolioLoadingStatus,
  selectShowSnapsModal,
  selectWalletAccountIds,
  selectWalletId,
} from 'state/slices/selectors'
import { useAppDispatch } from 'state/store'

import { AppLoadingIcon } from './AppLoadingIcon'
import { DegradedStateBanner } from './DegradedStateBanner'
import { GlobalSeachButton } from './GlobalSearch/GlobalSearchButton'
import { ChainMenu } from './NavBar/ChainMenu'
import { MobileNavBar } from './NavBar/MobileNavBar'
import { Notifications } from './NavBar/Notifications'
import { UserMenu } from './NavBar/UserMenu'
import { SideNavContent } from './SideNavContent'
import { TxWindow } from './TxWindow/TxWindow'

export const Header = memo(() => {
  const { onToggle, isOpen, onClose } = useDisclosure()
  const isDegradedState = useSelector(selectPortfolioLoadingStatus) === 'error'
  const snapModal = useModal('snaps')
  const isSnapInstalled = useIsSnapInstalled()
  const previousSnapInstall = usePrevious(isSnapInstalled)
  const showSnapModal = useSelector(selectShowSnapsModal)

  const history = useHistory()
  const {
    state: { isDemoWallet, wallet },
    dispatch,
  } = useWallet()
  const appDispatch = useAppDispatch()
  const translate = useTranslate()
  const ref = useRef<HTMLDivElement>(null)
  const [y, setY] = useState(0)
  const height = useMemo(() => ref.current?.getBoundingClientRect()?.height ?? 0, [])
  const { scrollY } = useScroll()
  const toast = useToast()
  useEffect(() => {
    return scrollY.onChange(() => setY(scrollY.get()))
  }, [scrollY])

  const isWalletConnectToDappsV2Enabled = useFeatureFlag('WalletConnectToDappsV2')

  /**
   * FOR DEVELOPERS:
   * Open the hidden flags menu via keypress
   */
  const handleKeyPress = useCallback(
    (event: { altKey: unknown; shiftKey: unknown; keyCode: number }) => {
      if (event.altKey && event.shiftKey && event.keyCode === 70) {
        history.push('/flags')
      }
    },
    [history],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  const handleBannerClick = useCallback(
    () => dispatch({ type: WalletActions.SET_WALLET_MODAL, payload: true }),
    [dispatch],
  )

  const currentWalletId = useSelector(selectWalletId)
  const walletAccountIds = useSelector(selectWalletAccountIds)
  const hasUtxoAccountIds = useMemo(
    () => walletAccountIds.some(accountId => isUtxoAccountId(accountId)),
    [walletAccountIds],
  )

  useEffect(() => {
    const isMetaMaskMultichainWallet = wallet instanceof MetaMaskShapeShiftMultiChainHDWallet
    if (!(currentWalletId && isMetaMaskMultichainWallet && isSnapInstalled === false)) return

    // We have just detected that the user doesn't have the snap installed currently
    // We need to check whether or not the user had previous non-EVM AccountIds and clear those
    if (hasUtxoAccountIds) appDispatch(portfolio.actions.clearWalletMetadata(currentWalletId))
  }, [appDispatch, currentWalletId, hasUtxoAccountIds, isSnapInstalled, wallet, walletAccountIds])

  useEffect(() => {
    if (previousSnapInstall === true && isSnapInstalled === false) {
      // they uninstalled the snap
      toast({
        status: 'success',
        title: translate('walletProvider.metaMaskSnap.snapUninstalledToast'),
        position: 'bottom',
      })
      const walletId = currentWalletId
      if (!walletId) return
      appDispatch(portfolio.actions.clearWalletMetadata(walletId))
      snapModal.open({ isRemoved: true })
    }
    if (previousSnapInstall === false && isSnapInstalled === true) {
      history.push(`/assets/${btcAssetId}`)

      // they installed the snap
      toast({
        status: 'success',
        title: translate('walletProvider.metaMaskSnap.snapInstalledToast'),
        position: 'bottom',
      })
      dispatch({ type: WalletActions.SET_WALLET_MODAL, payload: false })
    }
  }, [
    appDispatch,
    currentWalletId,
    dispatch,
    history,
    isSnapInstalled,
    previousSnapInstall,
    showSnapModal,
    snapModal,
    toast,
    translate,
    wallet,
    walletAccountIds,
  ])

  return (
    <>
      {isDemoWallet && (
        <Box
          bg='blue.500'
          width='full'
          paddingTop={{ base: 'calc(0.5rem + env(safe-area-inset-top))', md: 0 }}
          paddingBottom={{ base: '0.5rem', md: 0 }}
          minHeight='2.5rem'
          fontSize={{ base: 'sm', md: 'md' }}
          as='button'
          onClick={handleBannerClick}
        >
          <HStack
            verticalAlign='middle'
            justifyContent='center'
            spacing={3}
            color='white'
            wrap='wrap'
          >
            <InfoIcon boxSize='1.3em' />
            <Text display='inline' fontWeight='bold' translation='navBar.demoMode' />
            <Text display='inline' translation='navBar.clickToConnect' />
          </HStack>
        </Box>
      )}
      <Flex
        direction='column'
        width='full'
        position='sticky'
        zIndex='banner'
        ref={ref}
        bg={y > height ? 'background.surface.base' : 'transparent'}
        transitionDuration='200ms'
        transitionProperty='all'
        transitionTimingFunction='cubic-bezier(0.4, 0, 0.2, 1)'
        top={0}
        paddingTop={{ base: isDemoWallet ? 0 : 'env(safe-area-inset-top)', md: 0 }}
      >
        <HStack height='4.5rem' width='full' px={4}>
          <HStack width='full' margin='0 auto' px={{ base: 0, xl: 4 }} spacing={0} columnGap={4}>
            <Box flex={1} display={{ base: 'block', md: 'none' }}>
              <IconButton aria-label='Open menu' onClick={onToggle} icon={<HamburgerIcon />} />
            </Box>

            <Box display={{ base: 'block', md: 'none' }} mx='auto'>
              <AppLoadingIcon />
            </Box>

            <Flex
              justifyContent='flex-end'
              alignItems='center'
              width={{ base: 'auto', md: 'full' }}
              flex={1}
              rowGap={4}
              columnGap={2}
            >
              <GlobalSeachButton />
              {isDegradedState && <DegradedStateBanner />}
              {isWalletConnectToDappsV2Enabled && (
                <Box display={{ base: 'none', md: 'block' }}>
                  <WalletConnectToDappsHeaderButton />
                </Box>
              )}
              <ChainMenu display={{ base: 'none', md: 'block' }} />
              <TxWindow />
              <Notifications />
              <Box display={{ base: 'none', md: 'block' }}>
                <UserMenu />
              </Box>
            </Flex>
          </HStack>
        </HStack>
      </Flex>
      <Drawer isOpen={isOpen} onClose={onClose} placement='left'>
        <DrawerOverlay />
        <DrawerContent
          paddingTop='env(safe-area-inset-top)'
          paddingBottom='max(1rem, env(safe-area-inset-top))'
          overflowY='auto'
        >
          <SideNavContent onClose={onClose} />
        </DrawerContent>
      </Drawer>
      <MobileNavBar />
    </>
  )
})
