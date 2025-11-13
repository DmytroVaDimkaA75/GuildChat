const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
    justifyContent: "space-between",
  },
  dateGroup: {
    marginBottom: 10,
  },
  dateBlock: {
    alignItems: 'center',
    marginVertical: 10,
  },
  date: {
    fontSize: 14,
    color: "#fff",
    backgroundColor: "#999",
    padding: 5,
    borderRadius: 10,
  },
  messagesList: {
    flex: 1,
    paddingHorizontal: 10,
  },
  messageContainer: {
    marginVertical: 5,
    padding: 10,
    borderRadius: 10,
    position: 'relative',
  },
  standardBubble: {
    width: "80%",
  },
  flexibleBubble: {
    maxWidth: "80%",
    minWidth: "40%",
  },
  myMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#e6f4fd",
    zIndex: 1,
  },
  theirMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#fefacd",
    zIndex: 1,
  },
  messageText: {
    fontSize: 16,
    marginBottom: 2,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  messageDate: {
    fontSize: 12,
    color: '#888',
    marginLeft: 6,
  },
  inputContainer: {
    padding: 10,
    backgroundColor: "#fff",
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  input: {
    flex: 1,
    padding: 10,
    fontSize: 16,
  },
  iconButton: {
    marginHorizontal: 5,
  },
  blueIcon: {
    color: "#007bff",
  },
  defaultIcon: {
    color: "#ccc",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  groupAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: "#fff"
  },
  triangle: {
    width: 0,
    height: 0,
    borderStyle: "solid",
    position: 'absolute',
  },
  triangleMy: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#e6f4fd",
    zIndex: -1,
    bottom: 0,
    right: -10,
  },
  triangleTheir: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fefacd",
    zIndex: -1,
    bottom: 0,
    left: -10,
  },
  triangleMyHighlighted: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#2296f3",
    zIndex: -1,
    bottom: 0,
    right: -10,
  },
  triangleTheirHighlighted: {
    borderLeftWidth: 25,
    borderRightWidth: 25,
    borderBottomWidth: 25,
    borderTopWidth: 0,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#2296f3",
    zIndex: -1,
    bottom: 0,
    left: -10,
  },
  menu: {
    position: 'relative',
  },
  popupMenuInterlocutor: {
    position: 'absolute',
    left: 10,
    top: 0,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  popupMenuPersonal: {
    backgroundColor: '#ffffff',
    position: 'absolute',
    right: -155,
    top: 0,
    fontSize: 20,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#cccccc',
  },
  pinnedMessageWrapper: {
    flexDirection: 'row',
    // width: screenWidth,
    height: 50,
  },
  // pinnedMessagesContainer: {
  //   width: screenWidth - 50,
  // },
  pinnedMessageBlock: {
    // width: screenWidth - 50,
    height: 50,
    backgroundColor: '#fff',
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  pinnedContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  quotedContentRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    backgroundColor: "#d0e4f9",
    padding: 5,
    borderRadius: 10,
  },
  visualElementContainer: {
    width: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  pinnedImage: {
    width: 40,
    height: 40,
    borderRadius: 4,
  },
  pinnedTextColumn: {
    flex: 1,
    flexDirection: "column",
    justifyContent: "center",
    paddingLeft: 5,
  },
  pinnedHeader: {
    fontSize: 12,
    color: "#0088cc",
    marginBottom: 2,
  },
  pinnedText: {
    fontSize: 14,
    color: "#333",
  },
  pinnedLabel: {
    fontSize: 14,
    color: "gray",
  },
  pinIconContainer: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinIcon: {
    width: 24,
    height: 24,
    backgroundColor: 'transparent',
  },
  unpinButton: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  unpinText: {
    fontSize: 16,
    color: '#ff0000',
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f2f2f2',
    padding: 5,
  },
  replyingToText: {
    flex: 1,
    fontStyle: 'italic',
    color: '#666',
  },
  cancelReplyText: {
    color: '#007bff',
    marginLeft: 10,
  },
  highlightedMessage: {
    backgroundColor: '#2296f3',
    borderWidth: 1,
    borderColor: '#2296f3',
  },
  imageTextInput: {
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    width: '100%',
    marginBottom: 20,
  },
  buttonSendPhoto: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  buttonCancelPhoto: {
    backgroundColor: '#ddd',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  popupOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  sendOptionsPopup: {
    position: "absolute",
    bottom: 70,
    right: 20,
    width: 250,
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    alignItems: "flex-start",
  },
  sendOptionButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    width: "100%",
  },
  sendOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    width: "100%",
  },
  sendOptionText: {
    fontSize: 16,
    color: "#333",
    textAlign: "left",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: "80%",
    alignItems: "center",
    elevation: 2,
  },
  modalHeader: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    textAlign: "center",
  },
  fullSizeImageModalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  fullSizeImageModalContainer: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  fullSizeImage: {
    width: "100%",
    height: "100%",
  },
  scrollContent: {
    paddingVertical: 10,
  },
  translatedText: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
  },
  statusIcon: {
    color: "#8e8e8e",
  },
  secondCheck: {
    marginLeft: -8,
  },
  doubleCheckContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 5,
  },
  imagesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginVertical: 5,
  },
  linkPreviewContainer: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    backgroundColor: "#fff",
    width: "100%",
    position: "relative",
  },
  linkPreviewImage: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 4,
    marginRight: 8,
  },
  linkPreviewTextContainer: {
    flex: 2,
    justifyContent: "center",
  },
  linkPreviewTitle: {
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  linkPreviewDescription: {
    fontSize: 12,
    color: "#555",
  },
  youtubeIconContainer: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    padding: 2,
  },
  docsIconContainer: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 12,
    padding: 2,
  },
  singleImage: {
    width: "100%",
  },
  senderId: {
    fontSize: 10,
    color: "gray",
    marginBottom: 2,
  },
  interlocutorAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  // Стилі для модального вікна стилізації тексту
  formatModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    alignItems: 'center',
  },
  formatModalHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  formatPreview: {
    maxHeight: 150,
    width: '100%',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 12,
  },
  formatButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  formatButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e0e0e0',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  formatButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  formatModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
  },
  formatModalActionButton: {
    marginLeft: 16,
  },
  formatModalActionText: {
    color: '#1e88e5',
    fontWeight: '500',
  },
  formatTextContainer: {
    maxHeight: 150,
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  formatText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#333',
  },
  // кнопки стилізації
  formatButtonActive:   {
    backgroundColor: '#007bff' 
  },  // синій активний фон
  formatButtonDisabled: {
    backgroundColor: '#e0e0e0' 
  },  // сірий неактивний фон
  formatButtonTextActive:   {
    color: '#fff'
  },           // білий текст
  formatButtonTextDisabled: {
    color: '#aaa'
  },           // сірий текст

});