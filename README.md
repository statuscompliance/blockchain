This repository contains a set of tools to use a blockchain
network based on Hyperledger's Fabric test network on any [Node-RED's](https://nodered.org/)
flow. With these tools, you can create a *"proxy"* node that executes the logic on a *smart contract*
(a.k.a [Chaincode](https://www.geeksforgeeks.org/what-is-chaincode-in-hyperledger-fabric/#what-is-chaincode-in-hyperledger-fabric))
instead of Node-RED, saving the resulting message with a blockchain transaction. These *"proxy"* nodes are transparent
to Node-RED and can be a drop-in replacement to the original ones. Here is a diagram:

![](/assets/main_diagram.png)

If you are not knowledgeable enough of Node-RED's terminology,
please refer to [their glossary](https://nodered.org/docs/user-guide/concepts)

# What's the use case?

With the blockchain, you have tamper-proof records that ensure the integrity and immutability of your data. Every transaction recorded on the blockchain is cryptographically secured, meaning it cannot be altered or deleted without consensus from the network participants. This makes it ideal for scenarios where trust and transparency are critical, such as:

- **Auditing**: Blockchain provides a verifiable history of all transactions, making it easier to conduct audits and ensure compliance with regulations.
- **Data Integrity**: By storing data on the blockchain, you can guarantee that it has not been tampered with, which is essential for sensitive information like financial records, medical data, or supply chain tracking.
- **Dispute Resolution**: In cases of disputes, the blockchain serves as an authoritative source of truth, as all parties can independently verify the data without relying on a central authority.
- **Automation with Smart Contracts**: Smart contracts execute predefined logic automatically when conditions are met, ensuring that processes are carried out as intended without manual intervention.

By integrating blockchain into Node-RED flows, you can leverage these benefits seamlessly, enabling secure and transparent
business compliance.

# Getting started with STATUS' blockchain layer

## Proxy nodes

![](/assets/generation_diagram.png)

### Prerequisites

* Node.js `>=22.15.0`

### Generation

1. Run `npm ci`
2. Run `npx blockchainize-nodes [package(s)]`

> [!TIP]
> `blockchainize-nodes` uses the same syntax you are used to with `npm i`. For more information, run it
> without any argument to see the help message.
>
> Example: `npx blockchainize-nodes node-red-contrib-calc @statuscompliance/validation`

<a name="generation-3"></a>

3. A folder called `blockchain-conversion` will be created at the current directory.

    The folder contains a folder for each of the converted packages. In the example above, you will have 2 folders,
    `node-red-contrib-calc` and `statuscompliance-validation`. Every package's folder contains:

    * A `chaincode` folder, with the Hyperledger's Fabric chaincode for every node of the package.
    * A `.tar.gz` file, which is an npm package containing the *proxy* nodes.

## Blockchain container

All Hyperledger Fabric's binaries and the middleware that provides the RESTful service between the *proxy*
nodes and the blockchain are packaged as a single container to simplify its deployment and configuration.

### Prerequisites
* Docker (tested on 28.1.1)
* Linux/MacOS machine capable of running unix (bash-like) shell scripts

### Building

1. Run `./build-docker.sh` (at the root of this repository).

After running, the tagged image `statuscompliance/blockchain:latest` will be available in your Docker daemon.
`tar` archive files for different architectures will also be available under the `docker_images` folder.

## Running everything together

1. Copy the `ledger` service from the [docker-compose.yml](./docker-compose.yml) file of this repository
to the `docker-compose.yml` file
[of your full infrastructure deployment](https://github.com/statuscompliance/infrastructure/blob/main/docker-compose.yml).
**Make sure the mountpoint of the `blockchain-conversion` folder matches the location
[of the one you generated before](#generation-3).**

2. Add the `STATUS_LEDGER_ENDPOINT` environment variable to the node-red container of your full infrastructure deployment.
The value of the variable will be `ledger` (or the name of the key you used for declaring the new service).

    <details>
    <summary>See the relevant affected sections of the docker-compose.yml file</summary>

    > The `privileged: true` key in the ledger service is **important**

    ```diff
    services:
    +  ledger:
    +    restart: no
    +    container_name: ledger
    +    image: statuscompliance/blockchain
    +    privileged: true
    +    volumes:
    +      - ./blockchain-conversion:/chaincodes
    +    networks:
    +      - nodered_network

    nodered:
        restart: unless-stopped
        container_name: node-red-status
        image: ghcr.io/statuscompliance/node-red-status
        networks:
        - nodered_network
    +   environment:
    +      STATUS_LEDGER_ENDPOINT: ledger
        ...rest of the properties    
    ```
    </details>

3. Install the *proxy* nodes into your Node-RED instance.

    - Open Node-RED's flow editor and access the palette manager with `ALT + SHIFT + P` keyboard shortcut.
    - Navigate to the *Install* tab and click on the upload button.
    - Choose the `.tar.gz` files [generated by `blockchainize-nodes`](#generation-3)
    
    If you get lost at some point, head over the [official's Node-RED's documentation](https://nodered.org/docs/user-guide/editor/palette/manager#installing-nodes)

You are now ready to use Node-RED with the blockchain in your flows!

> [!TIP]
> The sample flows that some Node-RED's npm packages include (`flows.json` file) are also updated to
> use the *proxy* nodes, so you can use some of those sample nodes rightaway!