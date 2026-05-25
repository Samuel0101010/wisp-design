import {
  Flex, Text, Button, HStack, IconButton, useDisclosure, Drawer,
  DrawerBody, DrawerHeader, DrawerOverlay, DrawerContent
} from "@chakra-ui/react"

export function ChakraNav() {
  const { isOpen, onOpen, onClose } = useDisclosure()
  return (
    <>
      <Flex as="nav" px={6} py={3} align="center" borderBottomWidth="1px">
        <Text fontWeight="bold" fontSize="lg">Acme</Text>
        <HStack ml="auto" spacing={4}>
          <Button variant="ghost" size="sm">Home</Button>
          <Button variant="ghost" size="sm">About</Button>
          <Button colorScheme="blue" size="sm" onClick={onOpen}>Menu</Button>
        </HStack>
      </Flex>
      <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerHeader>Navigation</DrawerHeader>
          <DrawerBody>
            <Text>Nav items go here</Text>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  )
}
