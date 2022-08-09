import { ArrowForwardIcon, CheckIcon, CloseIcon } from '@chakra-ui/icons'
import { Box, Circle, Divider, Flex, FlexProps, Spinner, useColorModeValue } from '@chakra-ui/react'
import { Trade } from '@shapeshiftoss/swapper'
import { KnownChainIds } from '@shapeshiftoss/types'
import { TxStatus } from '@shapeshiftoss/unchained-client'
import { AssetIcon } from 'components/AssetIcon'

type AssetToAssetProps<C extends KnownChainIds> = {
  tradeFiatAmount: string
  buyIcon: string
  status?: TxStatus
  trade?: Trade<C>
} & FlexProps

export const AssetToAsset = ({
  tradeFiatAmount,
  buyIcon,
  trade,
  boxSize = '32px',
  status,
  ...rest
}: AssetToAssetProps<KnownChainIds>) => {
  const sellAssetColor = !status ? '#F7931A' : '#2775CA'
  const buyAssetColor = '#2775CA'
  const gray = useColorModeValue('white', 'gray.750')
  const red = useColorModeValue('white', 'red.500')
  const green = useColorModeValue('white', 'green.500')

  const renderIcon = () => {
    switch (status) {
      case TxStatus.Confirmed: {
        return (
          <Circle bg={green} size='100%'>
            <CheckIcon />
          </Circle>
        )
      }
      case TxStatus.Failed: {
        return (
          <Circle bg={red} size='100%'>
            <CloseIcon p={1} />
          </Circle>
        )
      }
      case TxStatus.Pending: {
        return (
          <Circle bg={gray} size='100%'>
            <Spinner />
          </Circle>
        )
      }
      default: {
        return (
          <Circle bg={gray} size='100%'>
            <ArrowForwardIcon />
          </Circle>
        )
      }
    }
  }

  return (
    <Flex width='full' justifyContent='space-between' alignItems='stretch' {...rest}>
      <Box flex={1} maxWidth={`calc(50% - ${boxSize} / 2)`}>
        <Flex alignItems='center'>
          <AssetIcon src={trade?.sellAsset.icon} boxSize={boxSize} />
          <Divider borderBottomWidth={2} flex={1} bgColor={sellAssetColor} />
        </Flex>
      </Box>
      <Flex>
        <Circle
          size={boxSize}
          bg='blue.500'
          p='2px'
          background={`linear-gradient(to right, ${sellAssetColor}, ${buyAssetColor})`}
        >
          {renderIcon()}
        </Circle>
      </Flex>
      <Flex flexDirection='column' flex={1} maxWidth={`calc(50% - ${boxSize} / 2)`}>
        <Flex alignItems='center' flex={1} justify='flex-start'>
          <Divider borderBottomWidth={2} flex={1} bgColor={buyAssetColor} />
          <AssetIcon src={buyIcon} boxSize={boxSize} />
        </Flex>
      </Flex>
    </Flex>
  )
}
