function getPropertyValue(obj = {}) {
    var obj = msg.payload || null;

            // Obtener la key del config o del mensaje
            let propertyToGet =
                msg.req &&
                msg.req.body &&
                msg.req.body.propertyToGet !== undefined
                    ? msg.req.body.propertyToGet
                    : config.propertyToGet;

            msg.payload = msg.array;
            // Verificar si obj es un objeto y key está definido
            if (typeof obj !== "object" || obj === null) {
                msg.value = null;
                node.send(msg);
            } else {
                if (!propertyToGet) {
                    node.error("Key must be defined");
                    return;
                }

                // Obtener el valor de la propiedad especificada
                var value = obj[propertyToGet] || obj.propertyToGet;

                // Asignar el valor al payload del mensaje
                msg.value = value !== undefined ? value : null;
}