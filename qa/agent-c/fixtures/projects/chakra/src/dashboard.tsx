import {
  Box, Flex, Heading, Text, Stack, Badge, Spinner, Divider, useColorModeValue
} from "@chakra-ui/react"

export function ChakraDashboard() {
  const bg = useColorModeValue("white", "gray.800")
  return (
    <Box bg={bg} minH="100vh" p={6}>
      <Heading mb={4}>Dashboard</Heading>
      <Flex gap={6} wrap="wrap">
        <Box borderWidth="1px" borderRadius="lg" p={4} flex="1">
          <Text fontSize="sm" color="gray.500">Revenue</Text>
          <Heading size="xl">$12,345</Heading>
          <Badge colorScheme="green" mt={2}>+12%</Badge>
        </Box>
        <Box borderWidth="1px" borderRadius="lg" p={4} flex="1">
          <Spinner />
          <Text mt={2}>Loading metrics...</Text>
        </Box>
      </Flex>
      <Divider my={6} />
      <Stack spacing={3}>
        <Text>Recent activity</Text>
      </Stack>
    </Box>
  )
}
