function getPropertyValue(object = {}) {
  // Obtener el array de objetos del mensaje
  const array = msg.payload;

  // Obtener key y keyValue del config o del mensaje
  const key
        = msg.req?.body && msg.req.body.key !== undefined
          ? msg.req.body.key
          : config.key;
  const keyValue
        = msg.req?.body && msg.req.body.keyValue !== undefined
          ? msg.req.body.keyValue
          : config.keyValue;

  // Verificar si array, key y keyValue están definidos
  if (!Array.isArray(array)) {
    node.error('Payload must be an array');
    return;
  }
  if (!key || !keyValue) {
    node.error('Key and keyValue must be defined');
    return;
  }

  // Buscar el objeto que tenga la propiedad con el valor especificado
  const foundObject = array.find(object_ => object_[key] === keyValue);

  // Asignar el objeto encontrado al payload del mensaje
  msg.payload = foundObject || null;
  msg.array = array;

  // Enviar el mensaje al siguiente nodo
  node.send(msg);
}
