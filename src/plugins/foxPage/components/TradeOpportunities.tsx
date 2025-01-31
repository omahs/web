import { Box, Card, CardBody, CardHeader, Flex, Image, Link, Text as CText } from '@chakra-ui/react'
import { useTranslate } from 'react-polyglot'
import { Text } from 'components/Text/Text'

type TradeOpportunity = {
  link: string
  icon: string
}

export type TradeOpportunitiesBucket = {
  title: string
  opportunities: TradeOpportunity[]
}

type TradeOpportunitiesProps = {
  opportunities: TradeOpportunitiesBucket[]
}

export const TradeOpportunities: React.FC<TradeOpportunitiesProps> = ({ opportunities }) => {
  const translate = useTranslate()

  return (
    <Card display='block' width='full'>
      <CardHeader pb={0}>
        <CText fontWeight='bold' color='inherit'>
          {translate('plugins.foxPage.availableToTradeOn')}
        </CText>
      </CardHeader>
      <CardBody>
        {opportunities.map((bucket, index) => (
          <Box my={2} key={index}>
            <Text translation={bucket.title} color='text.subtle' fontWeight='semibold' mb={4} />
            <Flex flexDirection='row' flexWrap='wrap' m={-2}>
              {bucket.opportunities.map((opportunity, index) => (
                <Link href={opportunity.link} isExternal key={index}>
                  <Image
                    borderRadius='full'
                    boxSize='32px'
                    m={2}
                    src={require(`../images/${opportunity.icon}`)}
                  />
                </Link>
              ))}
            </Flex>
          </Box>
        ))}
      </CardBody>
    </Card>
  )
}
