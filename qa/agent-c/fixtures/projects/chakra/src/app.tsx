import { Button, Input, Box, Text, Heading } from "@chakra-ui/react"

export function ChakraForm() {
  return (
    <Box p={6} borderRadius="lg" boxShadow="md" bg="white">
      <Heading size="md" mb={4}>Login</Heading>
      <Input placeholder="Email" type="email" mb={3} />
      <Input placeholder="Password" type="password" mb={4} />
      <Button colorScheme="blue" width="full">Sign In</Button>
      <Text mt={2} fontSize="sm" color="gray.500">Forgot your password?</Text>
    </Box>
  )
}
