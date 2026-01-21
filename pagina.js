function myFunction() {
  



}

function obtenerDatos() {

  encabezados = SpreadsheetApp.getActiveSpreadsheet().getDataRange().getRow();
   const techBrands = [
  "LenovoTech",
  "MsiTech",
  "DellTech",
  "DysonTech",
  "Tech4you HP",
  "SurfaceLabs",
  "AppleTech",
  "Don Cargador",
  "ThermomixTech",
  "Alquiler de Ordenadores",
  "Kelatos",
  "AcerTech",
  "PC4you",
  "ConvertVideo",
  "Dr. Recovery Data",
  "disco duro externo",
  "AsusTech"];

  let sheetHeaders = [
  "Resguardo de Recepcion",
  "Fecha Responsable de presupuesto",
  "Fecha de Elaboración de Presupuesto",
  "Técnico que ha reparado el equipo",
  "Fecha de Reparación",
  "Nombre de Cliente",
  "Telefono",
  "Correo electrónico",
  "Modelo/Marca Equipo",
  "Síntoma / Reparación",
  "Estado",
  "TIEMPO (DÍAS) DE ENTREGA DE EQUIPO",
  "Costo de Reparación sin IVA (No incluir precio de la pieza)",
  "COSTO DE PIEZA",
  "Ganancia Neta",
  "Responsable de Compra",
  "PROVEEDOR",
  "ENLACES DE COMPRA",
  "NÚMERO DE PEDIDO DE COMPRA",
  "FECHA DE PEDIDO",
  "Estado de Pedido",
  "Aviso Wasap Estado",
  "Fecha Límite Presupuesto",
  "Alerta envío de presupuesto",
  "Motivo Rechazo de Presupuesto",
  "FECHA ACEPTACION DE PRESUPUESTO (FECHA DE PEDIDO)",
  "FECHA DE ENTREGA",
  "CONTACTAR PROVEEDOR",
  "FECHA CONTACTO 1",
  "RECORDATORIO P1",
  "NÚMERO DE FACTURA",
  "FECHA DE RECOGIDA POR EL CLIENTE",
  "ESTADO DE RECOGIDA",
  "FICHA /MARCA",
  "Colocó Reseña",
  "OBSERVACIONES",
  "Envío de Encuesta",
  "Envío de enlace para reseña",
  "Ingresó Reseña?",
  "Obs (Entrega de Equipos)"
];

 let Estado_de_recogida = ["PENDIENTE", "ENTREGADO","ENVIO","RECICLAJE","REVISAR MOVIL"];


  let ficha_marca = [
  "LenovoTech",
  "MsiTech",
  "DellTech",
  "DysonTech",
  "Tech4you HP",
  "SurfaceLabs",
  "AppleTech",
  "Don Cargador",
  "ThermomixTech",
  "Alquiler de Ordenadores",
  "Kelatos",
  "AcerTech",
  "PC4you",
  "ConvertVideo",
  "Dr. Recovery Data",
  "disco duro externo",
  "AsusTech"
];





  //datos =encabezados.find('')


}

